<?php
/**
 * The singer side: replaces the Hub's "This Week's Assignments" sub-tab.
 *
 * The Hub (1.40.0+) passes every template file through `ansp_template_file`.
 * For `group-assignments` this add-on answers with its own template — but only
 * when at least one project on that tab has practice weeks this viewer can
 * see. Otherwise the Hub's original page (rehearsal notes, Tom's Hub doc)
 * stays exactly as it was, so switching the add-on on changes nothing until
 * Tom or Zahnay publishes a week.
 *
 * @package ArsNovaPractice
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Front end.
 */
class ANPR_Frontend {

	/** Cache of per-tab data, keyed by group slug. */
	protected static $data = array();

	/** Original Hub template paths, keyed by group slug. */
	protected static $original = array();

	/**
	 * Hook up.
	 */
	public static function init() {
		add_filter( 'ansp_template_file', array( __CLASS__, 'template' ), 10, 3 );
		add_action( 'wp_enqueue_scripts', array( __CLASS__, 'register_assets' ), 20 );
	}

	/**
	 * Setting: who sees the recording test.
	 *
	 * @return string off|managers|everyone
	 */
	public static function recording_mode() {
		$v = get_option( 'anpr_recording_test', 'managers' );
		return in_array( $v, array( 'off', 'managers', 'everyone' ), true ) ? $v : 'managers';
	}

	/**
	 * Register (and on the portal page, enqueue) CSS and JS.
	 */
	public static function register_assets() {
		wp_register_style( 'anpr-practice', ANPR_URL . 'assets/practice.css', array(), ANPR_VERSION );
		wp_register_script( 'anpr-practice', ANPR_URL . 'assets/practice.js', array(), ANPR_VERSION, true );

		$user_id    = get_current_user_id();
		$is_manager = $user_id && ANSP_Permissions::is_manager( $user_id );
		$mode       = self::recording_mode();
		wp_localize_script(
			'anpr-practice',
			'ANPR',
			array(
				'rest'      => esc_url_raw( rest_url( ANPR_Tracking::NS . '/event' ) ),
				'nonce'     => $user_id ? wp_create_nonce( 'wp_rest' ) : '',
				'playerUrl' => ANPR_URL . 'assets/player/player.js?ver=' . rawurlencode( ANPR_VERSION ),
				'recording' => ( 'everyone' === $mode || ( 'managers' === $mode && $is_manager ) ) ? 1 : 0,
				'playAfter' => 20,
				'ratings'   => ANPR_Tracking::rating_labels(),
				'i18n'      => array(
					'notRated'   => __( 'Not rated yet', 'ars-nova-practice' ),
					'played'     => __( 'Played %d×', 'ars-nova-practice' ),
					'notPlayed'  => __( 'Not played yet', 'ars-nova-practice' ),
					'open'       => __( 'Practice tracks', 'ars-nova-practice' ),
					'close'      => __( 'Close the player', 'ars-nova-practice' ),
					'loadFailed' => __( 'The practice player could not start in this browser. The tracks are also under Program Materials.', 'ars-nova-practice' ),
					'saveFailed' => __( 'That did not save. Check your connection and try again.', 'ars-nova-practice' ),
					'doneOf'     => __( '%1$d of %2$d done', 'ars-nova-practice' ),
					'player'     => array(
						'play'           => __( 'Play', 'ars-nova-practice' ),
						'pause'          => __( 'Pause', 'ars-nova-practice' ),
						'record'         => __( 'Record', 'ars-nova-practice' ),
						'stopRecord'     => __( 'Stop recording', 'ars-nova-practice' ),
						'stop'           => __( 'Stop and go back to the start', 'ars-nova-practice' ),
						'zoomIn'         => __( 'Zoom in', 'ars-nova-practice' ),
						'zoomOut'        => __( 'Zoom out', 'ars-nova-practice' ),
						'zoomFit'        => __( 'Fit the whole piece', 'ars-nova-practice' ),
						'loading'        => __( 'Loading the track…', 'ars-nova-practice' ),
						'ready'          => __( 'Ready', 'ars-nova-practice' ),
						'loadFailed'     => __( 'The track could not be loaded. Try again, or open it from Program Materials.', 'ars-nova-practice' ),
						'micAsk'         => __( 'Allow the microphone when your browser asks.', 'ars-nova-practice' ),
						'micDenied'      => __( 'The microphone could not be turned on. Check that this site is allowed to use it.', 'ars-nova-practice' ),
						'recording'      => __( 'Recording… sing along.', 'ars-nova-practice' ),
						'takeDone'       => __( 'Your take is on Track 2. Press Play to hear it with the music.', 'ars-nova-practice' ),
						'takeCleared'    => __( 'Take cleared. Press Record to try again.', 'ars-nova-practice' ),
						'myTake'         => __( 'My take', 'ars-nova-practice' ),
						'mute'           => __( 'Mute', 'ars-nova-practice' ),
						'solo'           => __( 'Solo', 'ars-nova-practice' ),
						'arm'            => __( 'Arm for recording', 'ars-nova-practice' ),
						'armFirst'       => __( 'Press R on Track 2 to arm it, then Record.', 'ars-nova-practice' ),
						'volume'         => __( 'Volume', 'ars-nova-practice' ),
						'pan'            => __( 'Pan', 'ars-nova-practice' ),
						'correction'     => __( 'Timing correction', 'ars-nova-practice' ),
						'correctionHelp' => __( 'If your take sounds late against the music, move this to the right before recording again.', 'ars-nova-practice' ),
						/* translators: %s: milliseconds */
						'latency'        => __( 'measured delay %s ms', 'ars-nova-practice' ),
						'deleteTake'     => __( 'Clear my take', 'ars-nova-practice' ),
						'deleteHint'     => __( 'To try again, click your take and press Delete, or use the bin. Recording again also replaces it.', 'ars-nova-practice' ),
						'download'       => __( 'Download my take (.wav)', 'ars-nova-practice' ),
						'headphones'     => __( 'Use WIRED headphones. Only your microphone is recorded, not the music. Bluetooth headphones add a delay.', 'ars-nova-practice' ),
						'notSaved'       => __( 'Your take stays in this page and is not uploaded. Download it to keep it.', 'ars-nova-practice' ),
					),
				),
			)
		);

		if ( is_singular() ) {
			$post = get_post();
			if ( $post instanceof WP_Post && has_shortcode( (string) $post->post_content, 'ans_singers_portal' ) ) {
				wp_enqueue_style( 'anpr-practice' );
				wp_enqueue_script( 'anpr-practice' );
			}
		}
	}

	/**
	 * Answer the Hub's template filter.
	 *
	 * @param string $file     Template path the Hub is about to load.
	 * @param string $template Template name.
	 * @param array  $args     Template variables.
	 * @return string
	 */
	public static function template( $file, $template, $args ) {
		if ( 'group-assignments' !== $template ) {
			return $file;
		}
		$slug = isset( $args['ansp_group_slug'] ) ? sanitize_key( (string) $args['ansp_group_slug'] ) : '';
		$data = self::data_for( $slug );
		self::$original[ $slug ] = $file;
		if ( empty( $data['projects'] ) && ! $data['is_manager'] ) {
			return $file;
		}
		return ANPR_DIR . 'templates/assignments.php';
	}

	/**
	 * The Hub's own template for a tab, for the fallback include.
	 *
	 * @param string $slug Group slug.
	 * @return string
	 */
	public static function original_template( $slug ) {
		return isset( self::$original[ $slug ] ) ? self::$original[ $slug ] : '';
	}

	/**
	 * Everything the singer template draws for one ensemble tab.
	 *
	 * @param string $slug Group slug.
	 * @return array { is_manager, parts, projects: [ { project, weeks, current, progress, plays, materials } ] }
	 */
	public static function data_for( $slug ) {
		if ( isset( self::$data[ $slug ] ) ) {
			return self::$data[ $slug ];
		}
		$user_id    = get_current_user_id();
		$is_manager = $user_id && ANSP_Permissions::is_manager( $user_id );
		$parts      = $user_id ? ANSP_Permissions::get_user_voice_parts( $user_id ) : array();
		$projects   = array();

		if ( $user_id ) {
			foreach ( ANPR_Weeks::projects_for_group( $slug, $user_id ) as $project ) {
				$vis = ANPR_Weeks::visible( $project->ID, $is_manager );
				if ( empty( $vis['weeks'] ) ) {
					continue;
				}
				$projects[] = array(
					'project'   => $project,
					'weeks'     => $vis['weeks'],
					'current'   => $vis['current'],
					'progress'  => ANPR_Tracking::progress_for_user( $user_id, $project->ID ),
					'plays'     => ANPR_Tracking::play_counts_for_user( $user_id, $project->ID ),
					'materials' => ANPR_Weeks::materials_by_id( $project->ID, $user_id ),
				);
			}
		}

		self::$data[ $slug ] = array(
			'is_manager' => $is_manager,
			'parts'      => $parts,
			'projects'   => $projects,
		);
		return self::$data[ $slug ];
	}

	/**
	 * The attached materials of a task, split into links and player tracks,
	 * limited to what this viewer may see and to their voice part.
	 *
	 * @param array    $task       Task.
	 * @param array    $materials  Viewer's rows by id.
	 * @param int      $project_id Project.
	 * @param string[] $parts      Viewer's voice parts.
	 * @param bool     $is_manager Viewer is a manager (sees every part's track).
	 * @return array { links: [], tracks: [] }
	 */
	public static function task_materials( $task, $materials, $project_id, $parts, $is_manager ) {
		$links  = array();
		$tracks = array();
		foreach ( $task['materials'] as $m ) {
			$row = ANPR_Weeks::resolve_material( $m, $materials, $project_id );
			if ( null === $row ) {
				continue; // Removed, or not something this viewer may see.
			}
			$rid   = sanitize_key( (string) $row['id'] );
			$title = isset( $row['title'] ) ? (string) $row['title'] : '';
			if ( 'track' === $m['role'] && ANPR_Weeks::is_track( $row ) ) {
				if ( '' !== $m['part'] && ! $is_manager && ! empty( $parts ) && ! in_array( $m['part'], $parts, true ) ) {
					continue; // Another voice part's track.
				}
				$tracks[] = array(
					'id'    => $rid,
					'title' => $title,
					// wp_nonce_url() returns an HTML-escaped URL (&amp;). This one goes
					// into JSON for JavaScript, which needs plain &, or every parameter
					// after the first is misread and the Hub answers 403. Staging
					// 2026-09-17: no practice track loaded at all.
					'src'   => str_replace( '&amp;', '&', ANSP_Player::play_url( $project_id, (string) $row['id'] ) ),
					'part'  => $m['part'],
					'pan'   => $m['pan'],
					'muted' => (bool) $m['muted'],
				);
			} else {
				$url = isset( $row['url'] ) ? (string) $row['url'] : '';
				if ( '' === $url ) {
					continue;
				}
				$links[] = array(
					'id'    => $rid,
					'title' => $title,
					'url'   => $url,
					'type'  => isset( $row['type'] ) ? (string) $row['type'] : '',
				);
			}
		}
		return array(
			'links'  => $links,
			'tracks' => $tracks,
		);
	}

	/**
	 * "Thursday, September 24" in the site's format, or ''.
	 *
	 * @param string $ymd Date.
	 * @return string
	 */
	public static function date_label( $ymd ) {
		if ( '' === $ymd ) {
			return '';
		}
		$ts = strtotime( $ymd . ' 12:00:00 UTC' );
		return $ts ? wp_date( 'l, F j', $ts, new DateTimeZone( 'UTC' ) ) : '';
	}
}
