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
				'takes'     => array(
					'rest'   => esc_url_raw( rest_url( ANPR_Tracking::NS . '/takes/' ) ),
					'save'   => ANPR_Takes::can_save( $user_id ) ? 1 : 0,
					'format' => ANPR_Takes::format(),
					'limit'  => ANPR_Takes::limit(),
				),
				'ratings'    => ANPR_Tracking::rating_labels(),
				'confidence' => array_map(
					static function ( $from, $text ) {
						return array( (int) $from, $text );
					},
					array_keys( ANPR_Tracking::confidence_steps() ),
					array_values( ANPR_Tracking::confidence_steps() )
				),
				'i18n'      => array(
					'notRated'   => __( 'Not rated yet', 'ars-nova-practice' ),
					'played'     => __( 'Played %d×', 'ars-nova-practice' ),
					'notPlayed'  => __( 'Not played yet', 'ars-nova-practice' ),
					'open'       => __( 'Practice tracks', 'ars-nova-practice' ),
					'close'      => __( 'Close the player', 'ars-nova-practice' ),
					'loadFailed' => __( 'The practice player could not start in this browser. The tracks are also under Program Materials.', 'ars-nova-practice' ),
					'saveFailed' => __( 'That did not save. Check your connection and try again.', 'ars-nova-practice' ),
					'doneOf'     => __( '%1$d of %2$d done', 'ars-nova-practice' ),
					/* translators: 1: rated tasks, 2: total tasks */
					'ratedOf'    => __( '%1$d of %2$d tasks rated', 'ars-nova-practice' ),
					'saySomething' => __( 'move a slider to say how it is going', 'ars-nova-practice' ),
					'featured'   => __( 'Your newest take for this piece is featured on your bio for the choir to hear.', 'ars-nova-practice' ),
					'featuredNoTake' => __( 'Save a take for this piece first, then it can be featured on your bio.', 'ars-nova-practice' ),
					/* translators: %d: seconds */
					'secLabel'   => __( '%d sec', 'ars-nova-practice' ),
					/* translators: %d: minutes */
					'minLabel'   => __( '%d min', 'ars-nova-practice' ),
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
						'download'       => __( 'Download this unsaved take (.wav)', 'ars-nova-practice' ),
						'headphones'     => __( 'Use WIRED headphones. Only your microphone is recorded, not the music. Bluetooth headphones add a delay.', 'ars-nova-practice' ),
						'notSaved'       => __( 'Your take stays in this page until you press Save take.', 'ars-nova-practice' ),
						'newTake'        => __( 'New take', 'ars-nova-practice' ),
						'newTakeHelp'    => __( 'Clear Track 2 and start a new take', 'ars-nova-practice' ),
						'newTakeConfirm' => __( 'This take is not saved. Press New take again to discard it.', 'ars-nova-practice' ),
						'newTakeReady'   => __( 'Ready for a new take. Press Record.', 'ars-nova-practice' ),
						'saveTake'       => __( 'Save take', 'ars-nova-practice' ),
						'saveTakeHelp'   => __( 'Mix your take with the music and save it', 'ars-nova-practice' ),
						'saved'          => __( 'Saved', 'ars-nova-practice' ),
						/* translators: %s: take name */
						'savedAs'        => __( 'Saved as "%s".', 'ars-nova-practice' ),
						'nothingToSave'  => __( 'Record a take first, then press Save take.', 'ars-nova-practice' ),
						'mixing'         => __( 'Mixing your take with the music…', 'ars-nova-practice' ),
						'converting'     => __( 'Converting…', 'ars-nova-practice' ),
						'uploading'      => __( 'Uploading…', 'ars-nova-practice' ),
						/* translators: %s: error */
						'saveFailed'     => __( 'The take could not be saved: %s', 'ars-nova-practice' ),
						/* translators: %s: number */
						'limitReached'   => __( 'You have %s saved takes for this piece. Delete one to save another.', 'ars-nova-practice' ),
						'allMuted'       => __( 'Both tracks are muted, so there is nothing to save. Unmute one first.', 'ars-nova-practice' ),
						'takeSilent'     => __( 'Your take is silent. Check the microphone and record again.', 'ars-nova-practice' ),
						'tooBig'         => __( 'This take is too long to save.', 'ars-nova-practice' ),
						'takesTitle'     => __( 'My saved takes', 'ars-nova-practice' ),
						/* translators: 1: saved takes, 2: limit */
						'takesCount'     => __( '%1$s of %2$s', 'ars-nova-practice' ),
						'takesEmpty'     => __( 'No saved takes yet. Record, then press Save take.', 'ars-nova-practice' ),
						/* translators: %s: take name */
						'playTake'       => __( 'Play %s', 'ars-nova-practice' ),
						/* translators: %s: take name */
						'pauseTake'      => __( 'Pause %s', 'ars-nova-practice' ),
						/* translators: %s: take name */
						'renameTake'     => __( 'Rename %s', 'ars-nova-practice' ),
						/* translators: %s: take name */
						'downloadTake'   => __( 'Download %s', 'ars-nova-practice' ),
						/* translators: %s: take name */
						'deleteSaved'    => __( 'Delete %s', 'ars-nova-practice' ),
						/* translators: %s: take name */
						'deleteConfirm'  => __( 'Press again to delete %s', 'ars-nova-practice' ),
						'deleted'        => __( 'Take deleted.', 'ars-nova-practice' ),
						'renamed'        => __( 'Renamed.', 'ars-nova-practice' ),
						'takeName'       => __( 'Take name', 'ars-nova-practice' ),
						'takePlayer'     => __( 'Saved take player', 'ars-nova-practice' ),
						/* translators: %s: error */
						'takeLoadFailed' => __( 'That take could not be played: %s', 'ars-nova-practice' ),
						'noTakeSelected' => __( 'Choose a take to play', 'ars-nova-practice' ),
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
					'seconds'   => ANPR_Tracking::seconds_for_user( $user_id, $project->ID ),
					'takes'     => ANPR_Takes::for_user( $user_id, $project->ID ),
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
				$piece    = ANPR_Takes::piece_of( $row );
				$tracks[] = array(
					'id'          => $rid,
					'title'       => $title,
					'piece'       => $piece['key'],
					'piece_label' => $piece['label'],
					// wp_nonce_url() returns an HTML-escaped URL (&amp;). This one goes
					// into JSON for JavaScript, which needs plain &, or every parameter
					// after the first is misread and the Hub answers 403. Staging
					// 2026-09-17: no practice track loaded at all.
					'src'   => str_replace( '&amp;', '&', ANSP_Player::play_url( $project_id, (string) $row['id'] ) ),
					'part'        => $m['part'],
					'pan'         => $m['pan'],
					'muted'       => (bool) $m['muted'],
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
	 * "18 min" / "45 sec" for a number of seconds (0.5.0).
	 *
	 * @param int $seconds Seconds.
	 * @return string
	 */
	public static function minutes_label( $seconds ) {
		$seconds = max( 0, (int) $seconds );
		if ( $seconds < 60 ) {
			/* translators: %d: seconds */
			return sprintf( __( '%d sec', 'ars-nova-practice' ), $seconds );
		}
		$mins = (int) round( $seconds / 60 );
		if ( $mins < 60 ) {
			/* translators: %d: minutes */
			return sprintf( __( '%d min', 'ars-nova-practice' ), $mins );
		}
		$h = intdiv( $mins, 60 );
		$m = $mins % 60;
		/* translators: 1: hours, 2: minutes */
		return $m ? sprintf( __( '%1\$dh %2\$dm', 'ars-nova-practice' ), $h, $m ) : sprintf( __( '%dh', 'ars-nova-practice' ), $h );
	}

	/**
	 * A week's or task's video as something the page can show (0.5.0).
	 *
	 * Tom pastes a normal YouTube or Vimeo link; the page embeds it without
	 * cookies. Anything else is offered as a plain link rather than an iframe.
	 *
	 * @param string $url Video URL.
	 * @return array { embed, url, host } embed is '' when it cannot be embedded.
	 */
	public static function video_embed( $url ) {
		$url = (string) $url;
		if ( '' === $url ) {
			return array( 'embed' => '', 'url' => '', 'host' => '' );
		}
		$host = strtolower( (string) wp_parse_url( $url, PHP_URL_HOST ) );
		$out  = array( 'embed' => '', 'url' => $url, 'host' => $host );
		$id   = '';
		if ( false !== strpos( $host, 'youtu.be' ) ) {
			$id = trim( (string) wp_parse_url( $url, PHP_URL_PATH ), '/' );
		} elseif ( false !== strpos( $host, 'youtube.com' ) ) {
			$q = array();
			parse_str( (string) wp_parse_url( $url, PHP_URL_QUERY ), $q );
			$id   = isset( $q['v'] ) ? (string) $q['v'] : '';
			$path = (string) wp_parse_url( $url, PHP_URL_PATH );
			if ( '' === $id && preg_match( '#/(embed|shorts|live)/([A-Za-z0-9_-]+)#', $path, $m ) ) {
				$id = $m[2];
			}
		}
		if ( '' !== $id && preg_match( '/^[A-Za-z0-9_-]{6,20}$/', $id ) ) {
			$out['embed'] = 'https://www.youtube-nocookie.com/embed/' . $id . '?rel=0';
			return $out;
		}
		if ( false !== strpos( $host, 'vimeo.com' ) && preg_match( '#/(\d{6,12})#', (string) wp_parse_url( $url, PHP_URL_PATH ), $m ) ) {
			$out['embed'] = 'https://player.vimeo.com/video/' . $m[1];
		}
		return $out;
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
