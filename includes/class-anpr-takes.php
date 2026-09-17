<?php
/**
 * Saved practice takes (0.4.0, Jonathan 2026-09-17).
 *
 * A singer records a take in the practice player and presses "Save take". The
 * BROWSER normalizes the voice, mixes it with the practice track, encodes the
 * mixdown (MP3 or WAV, see the setting) and uploads it straight to the private
 * takes bucket through a signed URL. WordPress never carries the audio:
 *
 *   1. POST takes/start   — checks who may save, the per-piece limit, and asks
 *                           the scores worker for a signed upload URL.
 *   2. browser PUTs the file to Google Cloud Storage.
 *   3. POST takes/finish  — asks the worker whether the object arrived, and
 *                           marks the take ready.
 *
 * Playing, downloading, renaming and deleting are POST routes too. Nothing here
 * is a GET, for the same reason as ANPR_Tracking (the Kinsta edge has cached an
 * authenticated GET before), and every response is no-store.
 *
 * Who can hear a take (decision 2026-09-16): the singer, Tom, Zahnay and site
 * admins — i.e. the singer and Hub managers. Only the singer renames or
 * deletes. Nothing is ever deleted automatically.
 *
 * Takes are counted per PIECE (the Hub material's piece label), per singer, per
 * concert. A practice track with no piece label counts as its own piece.
 *
 * @package ArsNovaPractice
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Saved takes.
 */
class ANPR_Takes {

	const LIVE_URL        = 'https://arsnovasingers.org';
	const DEFAULT_LIMIT   = 5;
	const PENDING_MINUTES = 120;

	/**
	 * Hook up.
	 */
	public static function init() {
		add_action( 'rest_api_init', array( __CLASS__, 'routes' ) );
	}

	/**
	 * Takes table.
	 *
	 * @return string
	 */
	public static function table() {
		global $wpdb;
		return $wpdb->prefix . 'anpr_takes';
	}

	/**
	 * Setting: MP3 or WAV mixdowns.
	 *
	 * @return string mp3|wav
	 */
	public static function format() {
		$v = get_option( 'anpr_take_format', 'mp3' );
		return in_array( $v, array( 'mp3', 'wav' ), true ) ? $v : 'mp3';
	}

	/**
	 * Setting: saved takes per piece.
	 *
	 * @return int
	 */
	public static function limit() {
		$v = (int) get_option( 'anpr_takes_per_piece', self::DEFAULT_LIMIT );
		return max( 1, min( 20, $v ) );
	}

	/**
	 * Is the storage side configured (the Hub's scores worker)?
	 *
	 * @return bool
	 */
	public static function available() {
		return class_exists( 'ANSP_Scores_Source' ) && ANSP_Scores_Source::is_configured();
	}

	/**
	 * May this user record and save takes? Same rule as the recording test.
	 *
	 * @param int $user_id User.
	 * @return bool
	 */
	public static function can_save( $user_id ) {
		if ( ! $user_id || ! self::available() ) {
			return false;
		}
		$mode = ANPR_Frontend::recording_mode();
		return 'everyone' === $mode || ( 'managers' === $mode && ANSP_Permissions::is_manager( $user_id ) );
	}

	/**
	 * "live" on arsnovasingers.org, "staging" anywhere else — so a copy of the
	 * site can never write into the live folder.
	 *
	 * @return string
	 */
	public static function env() {
		$host = wp_parse_url( (string) get_option( 'siteurl' ), PHP_URL_HOST );
		return ( wp_parse_url( self::LIVE_URL, PHP_URL_HOST ) === $host ) ? 'live' : 'staging';
	}

	/**
	 * The piece a practice track belongs to.
	 *
	 * @param array $row Hub material row.
	 * @return array { key, label }
	 */
	public static function piece_of( $row ) {
		$label = isset( $row['piece'] ) ? trim( (string) $row['piece'] ) : '';
		if ( '' !== $label ) {
			return array(
				'key'   => substr( 'p-' . sanitize_title( $label ), 0, 64 ),
				'label' => $label,
			);
		}
		$id = sanitize_key( isset( $row['id'] ) ? (string) $row['id'] : '' );
		return array(
			'key'   => substr( 'm-' . $id, 0, 64 ),
			'label' => isset( $row['title'] ) ? (string) $row['title'] : '',
		);
	}

	// ------------------------------------------------------------------
	// Worker.
	// ------------------------------------------------------------------

	/**
	 * Call the scores worker's /takes routes.
	 *
	 * @param string $route Route, e.g. '/takes/stat'.
	 * @param array  $body  JSON body.
	 * @return array|WP_Error Decoded body.
	 */
	protected static function worker( $route, $body ) {
		if ( ! self::available() ) {
			return new WP_Error( 'anpr_no_storage', __( 'Saving takes is not set up on this site yet.', 'ars-nova-practice' ), array( 'status' => 503 ) );
		}
		$res = wp_remote_post(
			ANSP_Scores_Source::worker_url() . $route,
			array(
				'timeout' => 20,
				'headers' => array(
					'Authorization' => 'Bearer ' . ANSP_Scores_Source::worker_token(),
					'Content-Type'  => 'application/json',
				),
				'body'    => wp_json_encode( (object) $body ),
			)
		);
		if ( is_wp_error( $res ) ) {
			return new WP_Error( 'anpr_storage', __( 'The take storage did not answer. Try again in a moment.', 'ars-nova-practice' ), array( 'status' => 502 ) );
		}
		$data = json_decode( (string) wp_remote_retrieve_body( $res ), true );
		if ( 200 !== (int) wp_remote_retrieve_response_code( $res ) || ! is_array( $data ) || empty( $data['ok'] ) ) {
			return new WP_Error( 'anpr_storage', __( 'The take storage refused the request.', 'ars-nova-practice' ), array( 'status' => 502 ) );
		}
		return $data;
	}

	// ------------------------------------------------------------------
	// Data.
	// ------------------------------------------------------------------

	/**
	 * A take as the browser sees it. The object path never leaves the server.
	 *
	 * @param object $row DB row.
	 * @return array
	 */
	public static function public_shape( $row ) {
		return array(
			'id'      => (string) $row->uuid,
			'name'    => (string) $row->name,
			'piece'   => (string) $row->piece_key,
			'track'   => (string) $row->track_title,
			'format'  => (string) $row->format,
			'bytes'   => (int) $row->bytes,
			'seconds' => (int) $row->seconds,
			'created' => mysql2date( 'M j, g:i a', get_date_from_gmt( $row->created_at ) ),
		);
	}

	/**
	 * A user's ready takes in one concert, grouped by piece key, oldest first.
	 *
	 * @param int $user_id    User.
	 * @param int $project_id Project.
	 * @return array piece_key => [ take, ... ]
	 */
	public static function for_user( $user_id, $project_id ) {
		global $wpdb;
		$table = self::table();
		$rows  = $wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$table} WHERE user_id = %d AND project_id = %d AND status = 'ready' ORDER BY id ASC", $user_id, $project_id ) ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$out   = array();
		foreach ( (array) $rows as $row ) {
			$out[ $row->piece_key ][] = self::public_shape( $row );
		}
		return $out;
	}

	/**
	 * Count a singer's takes for a piece, including uploads still in flight.
	 *
	 * @param int    $user_id    User.
	 * @param int    $project_id Project.
	 * @param string $piece_key  Piece.
	 * @return int
	 */
	protected static function count_for_piece( $user_id, $project_id, $piece_key ) {
		global $wpdb;
		$table  = self::table();
		$cutoff = gmdate( 'Y-m-d H:i:s', time() - self::PENDING_MINUTES * MINUTE_IN_SECONDS );
		return (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$table} WHERE user_id = %d AND project_id = %d AND piece_key = %s AND ( status = 'ready' OR created_at > %s )", $user_id, $project_id, $piece_key, $cutoff ) ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
	}

	/**
	 * Remove this user's abandoned uploads (started, never finished).
	 *
	 * @param int $user_id User.
	 */
	protected static function sweep_pending( $user_id ) {
		global $wpdb;
		$table  = self::table();
		$cutoff = gmdate( 'Y-m-d H:i:s', time() - self::PENDING_MINUTES * MINUTE_IN_SECONDS );
		$rows   = $wpdb->get_results( $wpdb->prepare( "SELECT id, object_path FROM {$table} WHERE user_id = %d AND status = 'pending' AND created_at <= %s LIMIT 20", $user_id, $cutoff ) ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		foreach ( (array) $rows as $row ) {
			$res = self::worker( '/takes/delete', array( 'path' => $row->object_path ) );
			if ( ! is_wp_error( $res ) ) {
				$wpdb->delete( $table, array( 'id' => (int) $row->id ) );
			}
		}
	}

	/**
	 * Find a take by public id.
	 *
	 * @param string $uuid Id.
	 * @return object|null
	 */
	protected static function find( $uuid ) {
		global $wpdb;
		$table = self::table();
		$uuid  = sanitize_key( (string) $uuid );
		if ( '' === $uuid ) {
			return null;
		}
		return $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$table} WHERE uuid = %s", $uuid ) ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
	}

	// ------------------------------------------------------------------
	// REST.
	// ------------------------------------------------------------------

	/**
	 * Register the routes (all POST, logged-in).
	 */
	public static function routes() {
		$logged_in = static function () {
			return is_user_logged_in();
		};
		foreach ( array( 'start', 'finish', 'rename', 'url', 'delete' ) as $action ) {
			register_rest_route(
				ANPR_Tracking::NS,
				'/takes/' . $action,
				array(
					'methods'             => 'POST',
					'callback'            => array( __CLASS__, 'rest_' . $action ),
					'permission_callback' => $logged_in,
				)
			);
		}
	}

	/**
	 * A take the current user owns, or may listen to.
	 *
	 * @param WP_REST_Request $req    Request.
	 * @param bool            $listen True to allow Hub managers too.
	 * @return object|WP_Error
	 */
	protected static function take_for_request( WP_REST_Request $req, $listen = false ) {
		$user_id = get_current_user_id();
		$row     = self::find( $req->get_param( 'take' ) );
		if ( ! $row ) {
			return new WP_Error( 'anpr_not_found', __( 'That take no longer exists.', 'ars-nova-practice' ), array( 'status' => 404 ) );
		}
		$owner = (int) $row->user_id === $user_id;
		if ( ! $owner && ! ( $listen && ANSP_Permissions::is_manager( $user_id ) ) ) {
			return new WP_Error( 'anpr_forbidden', 'Not allowed.', array( 'status' => 403 ) );
		}
		return $row;
	}

	/**
	 * 1. Start a save.
	 *
	 * @param WP_REST_Request $req Request: project_id, week_id, task_id, material_id, name, seconds.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function rest_start( WP_REST_Request $req ) {
		global $wpdb;
		$user_id = get_current_user_id();
		if ( ! self::can_save( $user_id ) ) {
			return new WP_Error( 'anpr_forbidden', __( 'Saving takes is not switched on for your account.', 'ars-nova-practice' ), array( 'status' => 403 ) );
		}
		$ctx = ANPR_Tracking::resolve( $user_id, (int) $req->get_param( 'project_id' ), (string) $req->get_param( 'week_id' ), (string) $req->get_param( 'task_id' ) );
		if ( is_wp_error( $ctx ) ) {
			return $ctx;
		}
		if ( empty( $ctx['task'] ) ) {
			return new WP_Error( 'anpr_bad_request', 'A task is required.', array( 'status' => 400 ) );
		}

		// The practice track must be one of this task's tracks, as this viewer sees them.
		$project_id  = (int) $ctx['project']->ID;
		$material_id = sanitize_key( (string) $req->get_param( 'material_id' ) );
		$materials   = ANPR_Weeks::materials_by_id( $project_id, $user_id );
		$parts       = ANSP_Permissions::get_user_voice_parts( $user_id );
		$mats        = ANPR_Frontend::task_materials( $ctx['task'], $materials, $project_id, $parts, ANSP_Permissions::is_manager( $user_id ) );
		$track       = null;
		foreach ( $mats['tracks'] as $t ) {
			if ( $t['id'] === $material_id ) {
				$track = $t;
				break;
			}
		}
		if ( null === $track ) {
			return new WP_Error( 'anpr_not_found', 'No such practice track.', array( 'status' => 404 ) );
		}

		self::sweep_pending( $user_id );
		$limit = self::limit();
		if ( self::count_for_piece( $user_id, $project_id, $track['piece'] ) >= $limit ) {
			return new WP_Error(
				'anpr_limit',
				/* translators: %d: number of takes */
				sprintf( __( 'You already have %d saved takes for this piece. Delete one to save another.', 'ars-nova-practice' ), $limit ),
				array( 'status' => 409 )
			);
		}

		$format = self::format();
		$uuid   = strtolower( str_replace( '-', '', wp_generate_uuid4() ) );
		$path   = sprintf( 'takes/%s/u%d/%s.%s', self::env(), $user_id, $uuid, $format );
		$name   = self::clean_name( $req->get_param( 'name' ) );
		if ( '' === $name ) {
			$name = self::default_name( $user_id, $project_id, $track );
		}

		$signed = self::worker( '/takes/upload-url', array( 'path' => $path ) );
		if ( is_wp_error( $signed ) ) {
			return $signed;
		}

		$now = current_time( 'mysql', true );
		$wpdb->insert(
			self::table(),
			array(
				'uuid'        => $uuid,
				'user_id'     => $user_id,
				'project_id'  => $project_id,
				'week_id'     => $ctx['week']['id'],
				'task_id'     => $ctx['task']['id'],
				'material_id' => $material_id,
				'piece_key'   => $track['piece'],
				'track_title' => mb_substr( (string) $track['title'], 0, 190 ),
				'name'        => $name,
				'object_path' => $path,
				'format'      => $format,
				'bytes'       => 0,
				'seconds'     => max( 0, min( 7200, (int) $req->get_param( 'seconds' ) ) ),
				'status'      => 'pending',
				'created_at'  => $now,
				'updated_at'  => $now,
			)
		);
		if ( ! $wpdb->insert_id ) {
			return new WP_Error( 'anpr_db', 'Could not record the take.', array( 'status' => 500 ) );
		}

		return rest_ensure_response(
			array(
				'ok'     => true,
				'take'   => $uuid,
				'name'   => $name,
				'format' => $format,
				'upload' => array(
					'url'       => (string) $signed['url'],
					'headers'   => (array) $signed['headers'],
					'max_bytes' => (int) $signed['max_bytes'],
				),
			)
		);
	}

	/**
	 * 3. Finish a save: the object must really be in the bucket.
	 *
	 * @param WP_REST_Request $req Request: take.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function rest_finish( WP_REST_Request $req ) {
		global $wpdb;
		$row = self::take_for_request( $req );
		if ( is_wp_error( $row ) ) {
			return $row;
		}
		if ( 'ready' !== $row->status ) {
			$stat = self::worker( '/takes/stat', array( 'path' => $row->object_path ) );
			if ( is_wp_error( $stat ) ) {
				return $stat;
			}
			if ( empty( $stat['exists'] ) || (int) $stat['size'] < 44 ) {
				return new WP_Error( 'anpr_upload_missing', __( 'The upload did not arrive. Try saving again.', 'ars-nova-practice' ), array( 'status' => 409 ) );
			}
			$wpdb->update(
				self::table(),
				array(
					'status'     => 'ready',
					'bytes'      => (int) $stat['size'],
					'updated_at' => current_time( 'mysql', true ),
				),
				array( 'id' => (int) $row->id )
			);
			$row = self::find( $row->uuid );
			ANPR_Tracking::log( (int) $row->user_id, (int) $row->project_id, (string) $row->week_id, (string) $row->task_id, (string) $row->material_id, 'take', (int) $row->seconds );
		}
		return rest_ensure_response(
			array(
				'ok'    => true,
				'take'  => self::public_shape( $row ),
				'count' => self::count_for_piece( (int) $row->user_id, (int) $row->project_id, (string) $row->piece_key ),
			)
		);
	}

	/**
	 * Rename.
	 *
	 * @param WP_REST_Request $req Request: take, name.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function rest_rename( WP_REST_Request $req ) {
		global $wpdb;
		$row = self::take_for_request( $req );
		if ( is_wp_error( $row ) ) {
			return $row;
		}
		$name = self::clean_name( $req->get_param( 'name' ) );
		if ( '' === $name ) {
			return new WP_Error( 'anpr_bad_request', __( 'A take needs a name.', 'ars-nova-practice' ), array( 'status' => 400 ) );
		}
		$wpdb->update(
			self::table(),
			array(
				'name'       => $name,
				'updated_at' => current_time( 'mysql', true ),
			),
			array( 'id' => (int) $row->id )
		);
		return rest_ensure_response(
			array(
				'ok'   => true,
				'take' => self::public_shape( self::find( $row->uuid ) ),
			)
		);
	}

	/**
	 * A fresh play or download link.
	 *
	 * @param WP_REST_Request $req Request: take, download (bool).
	 * @return WP_REST_Response|WP_Error
	 */
	public static function rest_url( WP_REST_Request $req ) {
		$row = self::take_for_request( $req, true );
		if ( is_wp_error( $row ) ) {
			return $row;
		}
		if ( 'ready' !== $row->status ) {
			return new WP_Error( 'anpr_not_found', __( 'That take is still uploading.', 'ars-nova-practice' ), array( 'status' => 404 ) );
		}
		$download = rest_sanitize_boolean( $req->get_param( 'download' ) );
		$res      = self::worker(
			'/takes/url',
			array(
				'path'     => $row->object_path,
				'download' => $download,
				'filename' => $row->name,
				'minutes'  => $download ? 10 : 120,
			)
		);
		if ( is_wp_error( $res ) ) {
			return $res;
		}
		if ( ! $download ) {
			ANPR_Tracking::log( get_current_user_id(), (int) $row->project_id, (string) $row->week_id, (string) $row->task_id, (string) $row->material_id, 'takeplay', 0 );
		}
		return rest_ensure_response(
			array(
				'ok'  => true,
				'url' => (string) $res['url'],
			)
		);
	}

	/**
	 * Delete — only the singer's own take, and only when the singer asks.
	 *
	 * @param WP_REST_Request $req Request: take.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function rest_delete( WP_REST_Request $req ) {
		global $wpdb;
		$row = self::take_for_request( $req );
		if ( is_wp_error( $row ) ) {
			return $row;
		}
		$res = self::worker( '/takes/delete', array( 'path' => $row->object_path ) );
		if ( is_wp_error( $res ) ) {
			return $res;
		}
		$wpdb->delete( self::table(), array( 'id' => (int) $row->id ) );
		ANPR_Tracking::log( (int) $row->user_id, (int) $row->project_id, (string) $row->week_id, (string) $row->task_id, (string) $row->material_id, 'takedel', 0 );
		return rest_ensure_response(
			array(
				'ok'    => true,
				'count' => self::count_for_piece( (int) $row->user_id, (int) $row->project_id, (string) $row->piece_key ),
			)
		);
	}

	// ------------------------------------------------------------------
	// Helpers.
	// ------------------------------------------------------------------

	/**
	 * A take name: plain text, at most 60 characters.
	 *
	 * @param mixed $raw Input.
	 * @return string
	 */
	public static function clean_name( $raw ) {
		$name = trim( preg_replace( '/\s+/', ' ', sanitize_text_field( (string) $raw ) ) );
		return mb_substr( $name, 0, 60 );
	}

	/**
	 * "Balada de la placeta – take 3" (the next unused number for the piece).
	 *
	 * @param int   $user_id    User.
	 * @param int   $project_id Project.
	 * @param array $track      Track.
	 * @return string
	 */
	protected static function default_name( $user_id, $project_id, $track ) {
		global $wpdb;
		$table = self::table();
		$n     = 1 + (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$table} WHERE user_id = %d AND project_id = %d AND piece_key = %s", $user_id, $project_id, $track['piece'] ) ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$base  = '' !== $track['piece_label'] ? $track['piece_label'] : $track['title'];
		/* translators: 1: piece, 2: number */
		return self::clean_name( sprintf( __( '%1$s – take %2$d', 'ars-nova-practice' ), mb_substr( $base, 0, 44 ), $n ) );
	}
}
