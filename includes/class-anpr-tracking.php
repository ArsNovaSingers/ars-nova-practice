<?php
/**
 * Practice tracking: what singers tick, rate, open and play.
 *
 * One REST route, POST only: `ars-nova-practice/v1/event`.
 *
 * WHY POST ONLY. The Kinsta edge has twice cached an authenticated GET on a
 * private REST route and replayed it to the public
 * (claude/infra/Kinsta_Edge_Cached_Authenticated_REST_2026-09-14.md). Nothing
 * here is read over REST: the singer page is drawn server-side on the logged-in
 * portal page, and the report is a wp-admin screen. The only REST traffic is
 * writes, which the edge does not cache — and they still send no-store.
 *
 * WHAT COUNTS AS A PLAY. The browser reports listening time in pieces while
 * the practice player runs. The page itself decides when a sitting reached 20
 * seconds and then sends one `play`; `listen` events carry the seconds. The
 * report shows both, so "played 3×" is never the only evidence.
 *
 * @package ArsNovaPractice
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Tracking.
 */
class ANPR_Tracking {

	const NS     = 'ars-nova-practice/v1';
	const EVENTS = array( 'view', 'open', 'play', 'listen', 'done', 'undone', 'rate', 'record' );

	/** Rating labels, index = stored value (pre-0.6.0 four-step scale). */
	public static function rating_labels() {
		return array(
			__( 'Bad', 'ars-nova-practice' ),
			__( 'Fair', 'ars-nova-practice' ),
			__( 'Good', 'ars-nova-practice' ),
			__( 'Great', 'ars-nova-practice' ),
		);
	}

	/**
	 * The confidence ladder (0.6.0, Jonathan): how it is going, 0 to 111%.
	 *
	 * The singer moves one slider; the sentence above it gets more confident as
	 * the number climbs, and 111% is the "feature my take on my bio" setting.
	 *
	 * @return array<int,string> lowest percentage => sentence
	 */
	public static function confidence_steps() {
		return array(
			0   => __( 'Never tried', 'ars-nova-practice' ),
			1   => __( 'Just had a first look', 'ars-nova-practice' ),
			11  => __( 'Not bad for a first go', 'ars-nova-practice' ),
			26  => __( 'Could be better', 'ars-nova-practice' ),
			41  => __( 'Making real progress', 'ars-nova-practice' ),
			56  => __( 'Pretty good', 'ars-nova-practice' ),
			71  => __( 'Really starting to sound good', 'ars-nova-practice' ),
			86  => __( 'Nearly concert ready', 'ars-nova-practice' ),
			100 => __( 'Nailed it', 'ars-nova-practice' ),
			101 => __( 'Off book and loving it', 'ars-nova-practice' ),
			111 => __( '111%. Feature this on my bio!', 'ars-nova-practice' ),
		);
	}

	/** The highest confidence a singer can set — the joke is the point. */
	const MAX_CONFIDENCE = 111;

	/**
	 * The sentence for a confidence value.
	 *
	 * @param int|null $value 0-111, or null when never set.
	 * @return string
	 */
	public static function confidence_label( $value ) {
		if ( null === $value || '' === $value ) {
			return __( 'Not said yet', 'ars-nova-practice' );
		}
		$value = max( 0, min( self::MAX_CONFIDENCE, (int) $value ) );
		$out   = '';
		foreach ( self::confidence_steps() as $from => $text ) {
			if ( $value >= $from ) {
				$out = $text;
			}
		}
		return $out;
	}

	/**
	 * A stored progress row's confidence, mapping pre-0.6.0 ratings (0-3).
	 *
	 * @param array|null $row Progress row.
	 * @return int|null
	 */
	public static function confidence_of( $row ) {
		if ( ! $row ) {
			return null;
		}
		if ( isset( $row['confidence'] ) && null !== $row['confidence'] && '' !== $row['confidence'] ) {
			return (int) $row['confidence'];
		}
		if ( isset( $row['rating'] ) && null !== $row['rating'] && '' !== $row['rating'] ) {
			return array( 0 => 10, 1 => 40, 2 => 70, 3 => 100 )[ (int) $row['rating'] ] ?? null;
		}
		return null;
	}

	/**
	 * Hook up.
	 */
	public static function init() {
		add_action( 'rest_api_init', array( __CLASS__, 'routes' ) );
		add_filter( 'rest_post_dispatch', array( __CLASS__, 'no_store' ), 10, 3 );
	}

	/**
	 * Register the route.
	 */
	public static function routes() {
		register_rest_route(
			self::NS,
			'/event',
			array(
				'methods'             => 'POST',
				'callback'            => array( __CLASS__, 'handle' ),
				'permission_callback' => static function () {
					return is_user_logged_in();
				},
			)
		);
	}

	/**
	 * Never let a response from this namespace be cached anywhere.
	 *
	 * @param WP_REST_Response $response Response.
	 * @param WP_REST_Server   $server   Server.
	 * @param WP_REST_Request  $request  Request.
	 * @return WP_REST_Response
	 */
	public static function no_store( $response, $server, $request ) {
		if ( 0 === strpos( (string) $request->get_route(), '/' . self::NS ) && $response instanceof WP_REST_Response ) {
			$response->header( 'Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0, private' );
			$response->header( 'Pragma', 'no-cache' );
		}
		return $response;
	}

	/**
	 * Record one event. The ids are checked by resolve().
	 *
	 * @param WP_REST_Request $req Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function handle( WP_REST_Request $req ) {
		$user_id    = get_current_user_id();
		$project_id = (int) $req->get_param( 'project_id' );
		$week_id    = sanitize_key( (string) $req->get_param( 'week_id' ) );
		$task_id    = sanitize_key( (string) $req->get_param( 'task_id' ) );
		$event      = sanitize_key( (string) $req->get_param( 'event' ) );

		if ( ! in_array( $event, self::EVENTS, true ) ) {
			return new WP_Error( 'anpr_bad_event', 'Unknown event.', array( 'status' => 400 ) );
		}
		$ctx = self::resolve( $user_id, $project_id, $week_id, $task_id );
		if ( is_wp_error( $ctx ) ) {
			return $ctx;
		}
		$task = $ctx['task'];
		if ( null === $task && 'view' !== $event ) {
			return new WP_Error( 'anpr_bad_request', 'A task is required.', array( 'status' => 400 ) );
		}

		$material_id = sanitize_key( (string) $req->get_param( 'material_id' ) );
		if ( '' !== $material_id && null !== $task ) {
			$ok   = false;
			$rows = ANPR_Weeks::materials_by_id( $project_id, $user_id );
			foreach ( $task['materials'] as $m ) {
				$row = ANPR_Weeks::resolve_material( $m, $rows, $project_id );
				if ( $m['id'] === $material_id || ( $row && sanitize_key( (string) $row['id'] ) === $material_id ) ) {
					$ok = true;
					break;
				}
			}
			if ( ! $ok ) {
				$material_id = '';
			}
		}

		$seconds = max( 0, min( 4 * HOUR_IN_SECONDS, (int) round( (float) $req->get_param( 'seconds' ) ) ) );
		$value   = null;
		if ( 'rate' === $event ) {
			$value = (int) $req->get_param( 'value' );
			if ( $value < 0 || $value > self::MAX_CONFIDENCE ) {
				return new WP_Error( 'anpr_bad_value', 'Confidence must be 0 to 111.', array( 'status' => 400 ) );
			}
		}
		if ( 'listen' === $event && 0 === $seconds ) {
			return rest_ensure_response( array( 'ok' => true, 'skipped' => true ) );
		}

		self::log( $user_id, $project_id, $week_id, $task_id, $material_id, $event, $seconds, $value );

		if ( in_array( $event, array( 'done', 'undone', 'rate' ), true ) ) {
			self::update_progress( $user_id, $project_id, $week_id, $task_id, $event, $value );
		}

		$out = array( 'ok' => true );
		if ( null !== $task ) {
			$out['plays'] = self::play_count( $user_id, $task_id );
		}

		// 111% features this singer's newest take for the piece on their bio;
		// anything less takes it down again (0.6.0, Jonathan).
		if ( 'rate' === $event && null !== $task && class_exists( 'ANPR_Takes' ) ) {
			$piece = self::piece_of_task( $task, (int) $ctx['project']->ID, $user_id );
			if ( '' !== $piece ) {
				$res                    = ANPR_Takes::set_featured( $user_id, (int) $ctx['project']->ID, $piece, self::MAX_CONFIDENCE === (int) $value );
				$out['featured']        = ! empty( $res['featured'] );
				$out['featured_failed'] = ( self::MAX_CONFIDENCE === (int) $value ) && empty( $res['featured'] );
			}
		}
		return rest_ensure_response( $out );
	}

	/**
	 * The piece key of a task's practice track, as this viewer sees it.
	 *
	 * @param array $task       Task.
	 * @param int   $project_id Project.
	 * @param int   $user_id    Viewer.
	 * @return string '' when the task has no practice track.
	 */
	public static function piece_of_task( $task, $project_id, $user_id ) {
		$rows  = ANPR_Weeks::materials_by_id( $project_id, $user_id );
		$parts = ANSP_Permissions::get_user_voice_parts( $user_id );
		$mats  = ANPR_Frontend::task_materials( $task, $rows, $project_id, $parts, ANSP_Permissions::is_manager( $user_id ) );
		return isset( $mats['tracks'][0]['piece'] ) ? (string) $mats['tracks'][0]['piece'] : '';
	}

	/**
	 * Check a project / week / task triple against what this viewer may see.
	 *
	 * The ids in a request are never trusted: the project must be one the
	 * viewer can see, the week must exist and be shown to them, and the task
	 * (when given) must belong to that week. Shared by events and saved takes.
	 *
	 * @param int    $user_id    User.
	 * @param int    $project_id Project.
	 * @param string $week_id    Week.
	 * @param string $task_id    Task, or ''.
	 * @return array|WP_Error { project: WP_Post, week: array, task: array|null }
	 */
	public static function resolve( $user_id, $project_id, $week_id, $task_id ) {
		$week_id    = sanitize_key( (string) $week_id );
		$task_id    = sanitize_key( (string) $task_id );
		$is_manager = ANSP_Permissions::is_manager( $user_id );
		if ( ! $is_manager && ! user_can( $user_id, 'ansp_view_portal' ) ) {
			return new WP_Error( 'anpr_forbidden', 'Not allowed.', array( 'status' => 403 ) );
		}
		$project = get_post( (int) $project_id );
		if ( ! $project || ANSP_CPT::POST_TYPE !== $project->post_type || ! ANSP_Permissions::user_can_see( $project, $user_id ) ) {
			return new WP_Error( 'anpr_forbidden', 'Not allowed.', array( 'status' => 403 ) );
		}
		$visible = ANPR_Weeks::visible( $project->ID, $is_manager );
		$week    = null;
		foreach ( $visible['weeks'] as $w ) {
			if ( $w['id'] === $week_id ) {
				$week = $w;
				break;
			}
		}
		if ( null === $week ) {
			return new WP_Error( 'anpr_not_found', 'No such week.', array( 'status' => 404 ) );
		}
		$task = null;
		if ( '' !== $task_id ) {
			foreach ( $week['tasks'] as $t ) {
				if ( $t['id'] === $task_id ) {
					$task = $t;
					break;
				}
			}
			if ( null === $task ) {
				return new WP_Error( 'anpr_not_found', 'No such task.', array( 'status' => 404 ) );
			}
		}
		return array(
			'project' => $project,
			'week'    => $week,
			'task'    => $task,
		);
	}

	/**
	 * Append to the event log.
	 */
	public static function log( $user_id, $project_id, $week_id, $task_id, $material_id, $event, $seconds, $value = null ) {
		global $wpdb;
		$wpdb->insert( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery
			ANPR_Schema::events_table(),
			array(
				'user_id'     => (int) $user_id,
				'project_id'  => (int) $project_id,
				'week_id'     => (string) $week_id,
				'task_id'     => (string) $task_id,
				'material_id' => (string) $material_id,
				'event'       => (string) $event,
				'seconds'     => (int) $seconds,
				'value'       => $value,
				'created_at'  => current_time( 'mysql', true ),
			),
			array( '%d', '%d', '%s', '%s', '%s', '%s', '%d', '%d', '%s' ) // A null value is written as NULL whatever its format.
		);
	}

	/**
	 * Update the singer's done/rating row for a task.
	 */
	protected static function update_progress( $user_id, $project_id, $week_id, $task_id, $event, $value ) {
		global $wpdb;
		$table = ANPR_Schema::progress_table();
		$now   = current_time( 'mysql', true );
		$row   = self::progress_row( $user_id, $task_id );

		$data = array(
			'user_id'    => (int) $user_id,
			'task_id'    => (string) $task_id,
			'project_id' => (int) $project_id,
			'week_id'    => (string) $week_id,
			'done'       => $row ? (int) $row['done'] : 0,
			'done_at'    => $row ? $row['done_at'] : null,
			'rating'     => $row && null !== $row['rating'] ? (int) $row['rating'] : null,
			'rated_at'   => $row ? $row['rated_at'] : null,
			'confidence' => $row && isset( $row['confidence'] ) && null !== $row['confidence'] ? (int) $row['confidence'] : null,
			'confidence_at' => $row && isset( $row['confidence_at'] ) ? $row['confidence_at'] : null,
			'updated_at' => $now,
		);
		if ( 'done' === $event ) {
			$data['done']    = 1;
			$data['done_at'] = $now;
		} elseif ( 'undone' === $event ) {
			$data['done']    = 0;
			$data['done_at'] = null;
		} elseif ( 'rate' === $event ) {
			// 0.6.0: one 0-111 confidence slider replaced Done and the 0-3 rating.
			$data['confidence']    = max( 0, min( self::MAX_CONFIDENCE, (int) $value ) );
			$data['confidence_at'] = $now;
			$data['rating']        = min( 3, (int) floor( $data['confidence'] / 34 ) );
			$data['rated_at']      = $now;
			$data['done']          = 0;
		}
		$wpdb->replace( $table, $data ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery
	}

	/**
	 * One progress row.
	 *
	 * @param int    $user_id User.
	 * @param string $task_id Task.
	 * @return array|null
	 */
	public static function progress_row( $user_id, $task_id ) {
		global $wpdb;
		$table = ANPR_Schema::progress_table();
		$row   = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$table} WHERE user_id = %d AND task_id = %s", (int) $user_id, (string) $task_id ), ARRAY_A ); // phpcs:ignore WordPress.DB
		return $row ? $row : null;
	}

	/**
	 * A singer's progress rows for a project, keyed by task id.
	 *
	 * @param int $user_id    User.
	 * @param int $project_id Project.
	 * @return array<string,array>
	 */
	public static function progress_for_user( $user_id, $project_id ) {
		global $wpdb;
		$table = ANPR_Schema::progress_table();
		$rows  = $wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$table} WHERE user_id = %d AND project_id = %d", (int) $user_id, (int) $project_id ), ARRAY_A ); // phpcs:ignore WordPress.DB
		$out   = array();
		foreach ( (array) $rows as $r ) {
			$out[ $r['task_id'] ] = $r;
		}
		return $out;
	}

	/**
	 * How many plays a singer has for a task.
	 *
	 * @param int    $user_id User.
	 * @param string $task_id Task.
	 * @return int
	 */
	public static function play_count( $user_id, $task_id ) {
		global $wpdb;
		$table = ANPR_Schema::events_table();
		return (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$table} WHERE user_id = %d AND task_id = %s AND event = 'play'", (int) $user_id, (string) $task_id ) ); // phpcs:ignore WordPress.DB
	}

	/**
	 * Play counts for one singer across a project, keyed by task id.
	 *
	 * @param int $user_id    User.
	 * @param int $project_id Project.
	 * @return array<string,int>
	 */
	public static function play_counts_for_user( $user_id, $project_id ) {
		global $wpdb;
		$table = ANPR_Schema::events_table();
		$rows  = $wpdb->get_results( $wpdb->prepare( "SELECT task_id, COUNT(*) AS n FROM {$table} WHERE user_id = %d AND project_id = %d AND event = 'play' GROUP BY task_id", (int) $user_id, (int) $project_id ), ARRAY_A ); // phpcs:ignore WordPress.DB
		$out   = array();
		foreach ( (array) $rows as $r ) {
			$out[ $r['task_id'] ] = (int) $r['n'];
		}
		return $out;
	}

	/**
	 * Time this singer has spent on each task: listening plus recording (0.5.0).
	 *
	 * Jonathan, 2026-09-17: "time rehearsed" counts both, because a singer
	 * recording a take is working just as much as one playing the track.
	 *
	 * @param int $user_id    User.
	 * @param int $project_id Project.
	 * @return array<string,int> task_id => seconds
	 */
	public static function seconds_for_user( $user_id, $project_id ) {
		global $wpdb;
		$table = ANPR_Schema::events_table();
		$rows  = $wpdb->get_results( $wpdb->prepare( "SELECT task_id, SUM(seconds) AS secs FROM {$table} WHERE user_id = %d AND project_id = %d AND event IN ('listen','record') GROUP BY task_id", (int) $user_id, (int) $project_id ), ARRAY_A ); // phpcs:ignore WordPress.DB
		$out   = array();
		foreach ( (array) $rows as $r ) {
			$out[ $r['task_id'] ] = (int) $r['secs'];
		}
		return $out;
	}

	/**
	 * Everything the report needs for one week, per user.
	 *
	 * @param int    $project_id Project.
	 * @param string $week_id    Week.
	 * @return array<int,array> user_id => { tasks: task_id => {done,rating,plays,listen,record,opens}, viewed, last }
	 */
	public static function week_summary( $project_id, $week_id ) {
		global $wpdb;
		$events   = ANPR_Schema::events_table();
		$progress = ANPR_Schema::progress_table();
		$out      = array();

		$rows = $wpdb->get_results( // phpcs:ignore WordPress.DB
			$wpdb->prepare(
				"SELECT user_id, task_id, event, COUNT(*) AS n, SUM(seconds) AS secs, MAX(created_at) AS last
				FROM {$events} WHERE project_id = %d AND week_id = %s GROUP BY user_id, task_id, event", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
				(int) $project_id,
				(string) $week_id
			),
			ARRAY_A
		);
		foreach ( (array) $rows as $r ) {
			$u = (int) $r['user_id'];
			if ( ! isset( $out[ $u ] ) ) {
				$out[ $u ] = array( 'tasks' => array(), 'viewed' => 0, 'last' => '' );
			}
			if ( $r['last'] > $out[ $u ]['last'] ) {
				$out[ $u ]['last'] = $r['last'];
			}
			if ( 'view' === $r['event'] ) {
				$out[ $u ]['viewed'] += (int) $r['n'];
				continue;
			}
			$t = (string) $r['task_id'];
			if ( '' === $t ) {
				continue;
			}
			if ( ! isset( $out[ $u ]['tasks'][ $t ] ) ) {
				$out[ $u ]['tasks'][ $t ] = array( 'done' => 0, 'rating' => null, 'confidence' => null, 'plays' => 0, 'listen' => 0, 'record' => 0, 'opens' => 0 );
			}
			if ( 'play' === $r['event'] ) {
				$out[ $u ]['tasks'][ $t ]['plays'] = (int) $r['n'];
			} elseif ( 'listen' === $r['event'] ) {
				$out[ $u ]['tasks'][ $t ]['listen'] = (int) $r['secs'];
			} elseif ( 'record' === $r['event'] ) {
				$out[ $u ]['tasks'][ $t ]['record'] = (int) $r['secs'];
			} elseif ( 'open' === $r['event'] ) {
				$out[ $u ]['tasks'][ $t ]['opens'] = (int) $r['n'];
			}
		}

		$prow = $wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$progress} WHERE project_id = %d AND week_id = %s", (int) $project_id, (string) $week_id ), ARRAY_A ); // phpcs:ignore WordPress.DB
		foreach ( (array) $prow as $r ) {
			$u = (int) $r['user_id'];
			$t = (string) $r['task_id'];
			if ( ! isset( $out[ $u ] ) ) {
				$out[ $u ] = array( 'tasks' => array(), 'viewed' => 0, 'last' => '' );
			}
			if ( ! isset( $out[ $u ]['tasks'][ $t ] ) ) {
				$out[ $u ]['tasks'][ $t ] = array( 'done' => 0, 'rating' => null, 'confidence' => null, 'plays' => 0, 'listen' => 0, 'record' => 0, 'opens' => 0 );
			}
			$out[ $u ]['tasks'][ $t ]['done']       = (int) $r['done'];
			$out[ $u ]['tasks'][ $t ]['rating']     = null === $r['rating'] ? null : (int) $r['rating'];
			$out[ $u ]['tasks'][ $t ]['confidence'] = self::confidence_of( $r );
			if ( $r['updated_at'] > $out[ $u ]['last'] ) {
				$out[ $u ]['last'] = $r['updated_at'];
			}
		}
		return $out;
	}
}
