<?php
/**
 * wp-admin: the weekly builder, the progress report and settings.
 *
 * Who can use it: Hub managers (ANSP_Permissions::is_manager) — Tom, Zahnay,
 * and administrators. The same test the Hub uses for "sees everything".
 *
 * The builder saves through admin-post.php, never through the project's own
 * edit form, so building a week can never touch the project's materials,
 * season or groups.
 *
 * @package ArsNovaPractice
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Admin screens.
 */
class ANPR_Admin {

	const SLUG     = 'anpr-practice';
	const PROGRESS = 'anpr-progress';
	const SETTINGS = 'anpr-settings';

	/**
	 * Hook up.
	 */
	public static function init() {
		add_action( 'admin_menu', array( __CLASS__, 'menu' ) );
		add_action( 'admin_post_anpr_save_weeks', array( __CLASS__, 'save_weeks' ) );
		add_action( 'admin_post_anpr_save_settings', array( __CLASS__, 'save_settings' ) );
		add_action( 'admin_enqueue_scripts', array( __CLASS__, 'assets' ) );
		add_action( 'add_meta_boxes', array( __CLASS__, 'meta_box' ) );
	}

	/**
	 * Is the current user allowed here?
	 *
	 * @return bool
	 */
	public static function allowed() {
		$uid = get_current_user_id();
		return $uid && ANSP_Permissions::is_manager( $uid );
	}

	/**
	 * Menu.
	 */
	public static function menu() {
		if ( ! self::allowed() ) {
			return;
		}
		add_menu_page(
			__( 'Practice assignments', 'ars-nova-practice' ),
			__( 'Practice', 'ars-nova-practice' ),
			'read',
			self::SLUG,
			array( __CLASS__, 'render_builder' ),
			'dashicons-playlist-audio',
			27
		);
		add_submenu_page( self::SLUG, __( 'Weekly builder', 'ars-nova-practice' ), __( 'Weekly builder', 'ars-nova-practice' ), 'read', self::SLUG, array( __CLASS__, 'render_builder' ) );
		add_submenu_page( self::SLUG, __( 'Practice progress', 'ars-nova-practice' ), __( 'Progress', 'ars-nova-practice' ), 'read', self::PROGRESS, array( __CLASS__, 'render_progress' ) );
		add_submenu_page( self::SLUG, __( 'Practice settings', 'ars-nova-practice' ), __( 'Settings', 'ars-nova-practice' ), 'read', self::SETTINGS, array( __CLASS__, 'render_settings' ) );
	}

	/**
	 * Admin CSS/JS on our screens.
	 *
	 * @param string $hook Screen hook.
	 */
	public static function assets( $hook ) {
		$page = isset( $_GET['page'] ) ? sanitize_key( wp_unslash( $_GET['page'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		if ( ! in_array( $page, array( self::SLUG, self::PROGRESS, self::SETTINGS ), true ) ) {
			return;
		}
		wp_enqueue_style( 'anpr-admin', ANPR_URL . 'assets/admin.css', array(), ANPR_VERSION );
		if ( self::SLUG === $page ) {
			wp_enqueue_script( 'anpr-builder', ANPR_URL . 'assets/builder.js', array(), ANPR_VERSION, true );
		}
	}

	/**
	 * Projects offered in the pickers: everything not archived, newest first.
	 *
	 * @return WP_Post[]
	 */
	public static function projects() {
		$posts = get_posts(
			array(
				'post_type'      => ANSP_CPT::POST_TYPE,
				'post_status'    => array( 'publish', 'draft', 'future', 'private', 'pending' ),
				'posts_per_page' => 200,
				'orderby'        => 'date',
				'order'          => 'DESC',
				'no_found_rows'  => true,
			)
		);
		$out = array();
		foreach ( $posts as $p ) {
			if ( 'archived' !== get_post_meta( $p->ID, 'ansp_project_status', true ) ) {
				$out[] = $p;
			}
		}
		return $out;
	}

	/**
	 * The project chosen on screen, or a sensible default.
	 *
	 * @param WP_Post[] $projects Options.
	 * @return WP_Post|null
	 */
	protected static function chosen_project( $projects ) {
		$id = isset( $_GET['project'] ) ? (int) $_GET['project'] : 0; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		foreach ( $projects as $p ) {
			if ( $p->ID === $id ) {
				return $p;
			}
		}
		// Default: the first published project in the current season.
		$season = ANSP_Taxonomies::get_current_season();
		foreach ( $projects as $p ) {
			if ( 'publish' === $p->post_status && $season instanceof WP_Term && has_term( (int) $season->term_id, 'ans_season', $p ) ) {
				return $p;
			}
		}
		return $projects ? $projects[0] : null;
	}

	/**
	 * Project <select> that reloads the screen.
	 *
	 * @param WP_Post[] $projects Options.
	 * @param WP_Post   $current  Selected.
	 * @param string    $page     Screen slug.
	 */
	protected static function project_picker( $projects, $current, $page ) {
		?>
		<form method="get" class="anpr-picker">
			<input type="hidden" name="page" value="<?php echo esc_attr( $page ); ?>">
			<label for="anpr-project"><strong><?php esc_html_e( 'Concert', 'ars-nova-practice' ); ?></strong></label>
			<select id="anpr-project" name="project" onchange="this.form.submit()">
				<?php foreach ( $projects as $p ) : ?>
					<option value="<?php echo esc_attr( (string) $p->ID ); ?>" <?php selected( $current && $current->ID === $p->ID ); ?>>
						<?php
						echo esc_html( get_the_title( $p ) );
						if ( 'publish' !== $p->post_status ) {
							echo esc_html( ' (' . $p->post_status . ')' );
						}
						?>
					</option>
				<?php endforeach; ?>
			</select>
			<noscript><button class="button"><?php esc_html_e( 'Show', 'ars-nova-practice' ); ?></button></noscript>
		</form>
		<?php
	}

	/**
	 * Material rows offered in the builder, for the chosen project.
	 *
	 * @param int $project_id Project.
	 * @return array[]
	 */
	protected static function builder_materials( $project_id ) {
		$out = array();
		foreach ( ANPR_Weeks::materials_by_id( $project_id, get_current_user_id() ) as $id => $row ) {
			$piece = class_exists( 'ANSP_Materials' ) ? (string) ANSP_Materials::get_piece( $row ) : ( isset( $row['piece'] ) ? (string) $row['piece'] : '' );
			$out[] = array(
				'id'       => $id,
				'title'    => isset( $row['title'] ) ? (string) $row['title'] : $id,
				'type'     => isset( $row['type'] ) ? (string) $row['type'] : '',
				'piece'    => $piece,
				'section'  => isset( $row['section'] ) ? (string) $row['section'] : '',
				'playable' => ANPR_Weeks::is_track( $row ),
			);
		}
		usort(
			$out,
			static function ( $a, $b ) {
				$k = strcasecmp( $a['piece'], $b['piece'] );
				return $k ? $k : strcasecmp( $a['title'], $b['title'] );
			}
		);
		return $out;
	}

	/**
	 * The builder screen.
	 */
	public static function render_builder() {
		if ( ! self::allowed() ) {
			wp_die( esc_html__( 'You do not have access to practice assignments.', 'ars-nova-practice' ) );
		}
		$projects = self::projects();
		$project  = self::chosen_project( $projects );
		?>
		<div class="wrap anpr-admin">
			<h1><?php esc_html_e( 'Weekly practice assignments', 'ars-nova-practice' ); ?></h1>
			<?php self::notices(); ?>
			<p class="description"><?php esc_html_e( 'Build each week\'s homework for a concert. Singers see a published week on the Singers Hub under "This Week\'s Assignments" from its "Show from" date. Drafts are visible only to staff, so the Hub page doubles as your preview.', 'ars-nova-practice' ); ?></p>

			<?php if ( ! $project ) : ?>
				<p><?php esc_html_e( 'There are no concerts yet.', 'ars-nova-practice' ); ?></p>
				<?php
				echo '</div>';
				return;
			endif;
			?>

			<?php self::project_picker( $projects, $project, self::SLUG ); ?>

			<p class="anpr-links">
				<a href="<?php echo esc_url( function_exists( 'ansp_get_portal_url' ) ? ansp_get_portal_url() : home_url( '/portal/' ) ); ?>" target="_blank" rel="noopener"><?php esc_html_e( 'Open the Singers Hub (preview)', 'ars-nova-practice' ); ?></a>
				· <a href="<?php echo esc_url( admin_url( 'admin.php?page=' . self::PROGRESS . '&project=' . $project->ID ) ); ?>"><?php esc_html_e( 'Progress report', 'ars-nova-practice' ); ?></a>
				· <a href="<?php echo esc_url( get_edit_post_link( $project->ID ) ); ?>"><?php esc_html_e( 'Edit the concert and its materials', 'ars-nova-practice' ); ?></a>
			</p>

			<?php
			// Point every attached material at the row it is listed under today
			// (see ANPR_Weeks::resolve_material), so nothing reads as missing
			// just because the Hub swapped a score's id.
			$weeks = ANPR_Weeks::get( $project->ID );
			$rows  = ANPR_Weeks::materials_by_id( $project->ID, get_current_user_id() );
			foreach ( $weeks as &$w ) {
				foreach ( $w['tasks'] as &$t ) {
					foreach ( $t['materials'] as &$m ) {
						$row = ANPR_Weeks::resolve_material( $m, $rows, $project->ID );
						if ( $row ) {
							$m['id'] = sanitize_key( (string) $row['id'] );
						}
					}
					unset( $m );
				}
				unset( $t );
			}
			unset( $w );
			$config = array(
				'weeks'     => $weeks,
				'materials' => self::builder_materials( $project->ID ),
				'parts'     => function_exists( 'ansp_voice_part_options' ) ? ansp_voice_part_options() : array(),
				'today'     => ANPR_Weeks::today(),
			);
			?>
			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" id="anpr-builder-form">
				<input type="hidden" name="action" value="anpr_save_weeks">
				<input type="hidden" name="project_id" value="<?php echo esc_attr( (string) $project->ID ); ?>">
				<input type="hidden" name="anpr_weeks_json" id="anpr-weeks-json" value="">
				<?php wp_nonce_field( 'anpr_save_weeks_' . $project->ID, 'anpr_nonce' ); ?>
				<div id="anpr-builder" data-config="<?php echo esc_attr( wp_json_encode( $config ) ); ?>">
					<p><?php esc_html_e( 'Loading the builder… (JavaScript is needed for this screen.)', 'ars-nova-practice' ); ?></p>
				</div>
				<p class="anpr-savebar">
					<button type="submit" class="button button-primary button-hero"><?php esc_html_e( 'Save all weeks', 'ars-nova-practice' ); ?></button>
					<span class="anpr-dirty" hidden><?php esc_html_e( 'You have unsaved changes.', 'ars-nova-practice' ); ?></span>
				</p>
			</form>
		</div>
		<?php
	}

	/**
	 * Save handler.
	 */
	public static function save_weeks() {
		$project_id = isset( $_POST['project_id'] ) ? (int) $_POST['project_id'] : 0;
		if ( ! self::allowed() ) {
			wp_die( esc_html__( 'You do not have access to practice assignments.', 'ars-nova-practice' ), 403 );
		}
		check_admin_referer( 'anpr_save_weeks_' . $project_id, 'anpr_nonce' );
		$project = get_post( $project_id );
		if ( ! $project || ANSP_CPT::POST_TYPE !== $project->post_type ) {
			wp_die( esc_html__( 'That concert was not found.', 'ars-nova-practice' ), 404 );
		}
		$json  = isset( $_POST['anpr_weeks_json'] ) ? wp_unslash( $_POST['anpr_weeks_json'] ) : ''; // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- decoded then sanitized field by field.
		$weeks = json_decode( (string) $json, true );
		$code  = 'saved';
		if ( ! is_array( $weeks ) ) {
			$code = 'badjson';
		} else {
			$stored = ANPR_Weeks::save( $project_id, $weeks );
			update_post_meta( $project_id, '_anpr_weeks_saved', array( 'by' => get_current_user_id(), 'at' => time(), 'weeks' => count( $stored ) ) );
		}
		wp_safe_redirect( admin_url( 'admin.php?page=' . self::SLUG . '&project=' . $project_id . '&anpr_msg=' . $code ) );
		exit;
	}

	/**
	 * Result notices.
	 */
	protected static function notices() {
		$msg = isset( $_GET['anpr_msg'] ) ? sanitize_key( wp_unslash( $_GET['anpr_msg'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		if ( 'saved' === $msg ) {
			echo '<div class="notice notice-success is-dismissible"><p>' . esc_html__( 'Weeks saved.', 'ars-nova-practice' ) . '</p></div>';
		} elseif ( 'badjson' === $msg ) {
			echo '<div class="notice notice-error"><p>' . esc_html__( 'Nothing was saved: the builder sent something unreadable. Reload the page and try again.', 'ars-nova-practice' ) . '</p></div>';
		} elseif ( 'settings' === $msg ) {
			echo '<div class="notice notice-success is-dismissible"><p>' . esc_html__( 'Settings saved.', 'ars-nova-practice' ) . '</p></div>';
		}
	}

	/**
	 * Singers who can see a project, for the report.
	 *
	 * Everyone with a linked singer profile whose groups reach the project.
	 * The Claude test account is left out.
	 *
	 * @param WP_Post $project Project.
	 * @return WP_User[]
	 */
	protected static function singers_for( $project ) {
		$exclude = (array) apply_filters( 'anpr_report_exclude_logins', array( 'claude' ) );
		$users   = get_users(
			array(
				'meta_key'     => 'ansp_singer_profile', // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
				'meta_compare' => 'EXISTS',
				'number'       => 500,
				'orderby'      => 'display_name',
			)
		);
		$out = array();
		foreach ( $users as $u ) {
			if ( in_array( $u->user_login, $exclude, true ) ) {
				continue;
			}
			if ( ! (int) get_user_meta( $u->ID, 'ansp_singer_profile', true ) ) {
				continue;
			}
			if ( ! user_can( $u, 'ansp_view_portal' ) ) {
				continue;
			}
			if ( ANSP_Permissions::user_can_see( $project, $u->ID ) && array() !== ANSP_Permissions::get_user_group_slugs( $u->ID ) ) {
				$out[] = $u;
			}
		}
		return $out;
	}

	/**
	 * The progress report.
	 */
	public static function render_progress() {
		if ( ! self::allowed() ) {
			wp_die( esc_html__( 'You do not have access to practice assignments.', 'ars-nova-practice' ) );
		}
		$projects = self::projects();
		$project  = self::chosen_project( $projects );
		echo '<div class="wrap anpr-admin"><h1>' . esc_html__( 'Practice progress', 'ars-nova-practice' ) . '</h1>';
		if ( ! $project ) {
			echo '<p>' . esc_html__( 'There are no concerts yet.', 'ars-nova-practice' ) . '</p></div>';
			return;
		}
		self::project_picker( $projects, $project, self::PROGRESS );

		$weeks = ANPR_Weeks::sort_by_due( ANPR_Weeks::get( $project->ID ) );
		if ( empty( $weeks ) ) {
			echo '<p>' . esc_html__( 'This concert has no practice weeks yet.', 'ars-nova-practice' ) . ' <a href="' . esc_url( admin_url( 'admin.php?page=' . self::SLUG . '&project=' . $project->ID ) ) . '">' . esc_html__( 'Open the builder', 'ars-nova-practice' ) . '</a></p></div>';
			return;
		}
		$vis     = ANPR_Weeks::visible( $project->ID, false );
		$week_id = isset( $_GET['week'] ) ? sanitize_key( wp_unslash( $_GET['week'] ) ) : $vis['current']; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		$week    = null;
		foreach ( $weeks as $w ) {
			if ( $w['id'] === $week_id ) {
				$week = $w;
			}
		}
		if ( ! $week ) {
			$week = $weeks[0];
		}
		?>
		<form method="get" class="anpr-picker">
			<input type="hidden" name="page" value="<?php echo esc_attr( self::PROGRESS ); ?>">
			<input type="hidden" name="project" value="<?php echo esc_attr( (string) $project->ID ); ?>">
			<label for="anpr-week"><strong><?php esc_html_e( 'Week', 'ars-nova-practice' ); ?></strong></label>
			<select id="anpr-week" name="week" onchange="this.form.submit()">
				<?php foreach ( $weeks as $w ) : ?>
					<option value="<?php echo esc_attr( $w['id'] ); ?>" <?php selected( $w['id'], $week['id'] ); ?>>
						<?php
						echo esc_html(
							( '' !== $w['title'] ? $w['title'] : __( '(untitled week)', 'ars-nova-practice' ) )
							. ( '' !== $w['due_date'] ? ' — ' . ANPR_Frontend::date_label( $w['due_date'] ) : '' )
							. ( 'published' !== $w['status'] ? ' (' . __( 'draft', 'ars-nova-practice' ) . ')' : '' )
						);
						?>
					</option>
				<?php endforeach; ?>
			</select>
		</form>
		<?php

		$singers = self::singers_for( $project );
		$summary = ANPR_Tracking::week_summary( $project->ID, $week['id'] );
		$labels  = ANPR_Tracking::rating_labels();
		$tasks   = $week['tasks'];

		$opened    = 0;
		$all_done  = 0;
		$not_seen  = array();
		$struggles = array();
		foreach ( $singers as $u ) {
			$parts = ANSP_Permissions::get_user_voice_parts( $u->ID );
			$s     = isset( $summary[ $u->ID ] ) ? $summary[ $u->ID ] : null;
			if ( $s && $s['viewed'] ) {
				++$opened;
			} else {
				$not_seen[] = $u->display_name;
			}
			$mine = 0;
			$done = 0;
			foreach ( $tasks as $t ) {
				if ( ! ANPR_Weeks::task_is_for( $t, $parts ) ) {
					continue;
				}
				++$mine;
				$ts = $s && isset( $s['tasks'][ $t['id'] ] ) ? $s['tasks'][ $t['id'] ] : null;
				if ( $ts && $ts['done'] ) {
					++$done;
				}
				if ( $ts && null !== $ts['rating'] && $ts['rating'] <= 0 ) {
					$struggles[] = $u->display_name . ' — ' . $t['title'];
				}
			}
			if ( $mine && $done === $mine ) {
				++$all_done;
			}
		}
		$n = count( $singers );
		?>
		<div class="anpr-cards">
			<div class="anpr-card"><span class="anpr-card-num"><?php echo esc_html( $opened . ' / ' . $n ); ?></span><?php esc_html_e( 'opened this week', 'ars-nova-practice' ); ?></div>
			<div class="anpr-card"><span class="anpr-card-num"><?php echo esc_html( $all_done . ' / ' . $n ); ?></span><?php esc_html_e( 'marked every task done', 'ars-nova-practice' ); ?></div>
			<div class="anpr-card"><span class="anpr-card-num"><?php echo esc_html( (string) count( $struggles ) ); ?></span><?php esc_html_e( 'tasks rated "Bad"', 'ars-nova-practice' ); ?></div>
		</div>

		<?php if ( 'published' !== $week['status'] ) : ?>
			<p class="anpr-staff-note"><?php esc_html_e( 'This week is a draft, so singers cannot see it yet.', 'ars-nova-practice' ); ?></p>
		<?php endif; ?>

		<?php if ( $struggles ) : ?>
			<h2><?php esc_html_e( 'Needs attention', 'ars-nova-practice' ); ?></h2>
			<ul class="anpr-attention">
				<?php foreach ( $struggles as $line ) : ?>
					<li><?php echo esc_html( $line ); ?></li>
				<?php endforeach; ?>
			</ul>
		<?php endif; ?>

		<?php if ( $not_seen && $n ) : ?>
			<details class="anpr-notseen">
				<summary><?php echo esc_html( sprintf( /* translators: %d: count */ _n( '%d singer has not opened this week', '%d singers have not opened this week', count( $not_seen ), 'ars-nova-practice' ), count( $not_seen ) ) ); ?></summary>
				<p><?php echo esc_html( implode( ', ', $not_seen ) ); ?></p>
			</details>
		<?php endif; ?>

		<div class="anpr-table-wrap">
		<table class="widefat striped anpr-report">
			<thead>
				<tr>
					<th scope="col"><?php esc_html_e( 'Singer', 'ars-nova-practice' ); ?></th>
					<th scope="col"><?php esc_html_e( 'Last activity', 'ars-nova-practice' ); ?></th>
					<?php foreach ( $tasks as $i => $t ) : ?>
						<th scope="col" title="<?php echo esc_attr( $t['title'] ); ?>">
							<?php echo esc_html( ( $i + 1 ) . '. ' . wp_trim_words( $t['title'], 5 ) ); ?>
							<?php if ( $t['parts'] ) : ?>
								<br><small><?php echo esc_html( implode( ', ', $t['parts'] ) ); ?></small>
							<?php endif; ?>
						</th>
					<?php endforeach; ?>
				</tr>
			</thead>
			<tbody>
				<?php if ( ! $singers ) : ?>
					<tr><td colspan="<?php echo esc_attr( (string) ( 2 + count( $tasks ) ) ); ?>"><?php esc_html_e( 'No singers can see this concert yet.', 'ars-nova-practice' ); ?></td></tr>
				<?php endif; ?>
				<?php foreach ( $singers as $u ) : ?>
					<?php
					$s     = isset( $summary[ $u->ID ] ) ? $summary[ $u->ID ] : null;
					$parts = ANSP_Permissions::get_user_voice_parts( $u->ID );
					?>
					<tr>
						<th scope="row">
							<?php echo esc_html( $u->display_name ); ?>
							<?php if ( $parts ) : ?>
								<br><small><?php echo esc_html( implode( ', ', $parts ) ); ?></small>
							<?php endif; ?>
						</th>
						<td>
							<?php
							if ( $s && '' !== $s['last'] ) {
								$ts = strtotime( $s['last'] . ' UTC' );
								echo esc_html( wp_date( 'M j, g:i a', $ts ) );
								if ( ! $s['viewed'] ) {
									echo '<br><small>' . esc_html__( 'week not opened', 'ars-nova-practice' ) . '</small>';
								}
							} else {
								echo '<span class="anpr-dim">' . esc_html__( 'nothing yet', 'ars-nova-practice' ) . '</span>';
							}
							?>
						</td>
						<?php foreach ( $tasks as $t ) : ?>
							<?php
							if ( ! ANPR_Weeks::task_is_for( $t, $parts ) ) {
								echo '<td class="anpr-dim">—</td>';
								continue;
							}
							$ts = $s && isset( $s['tasks'][ $t['id'] ] ) ? $s['tasks'][ $t['id'] ] : null;
							?>
							<td class="<?php echo ( $ts && $ts['done'] ) ? 'anpr-cell-done' : ''; ?>">
								<?php
								$bits = array();
								$bits[] = ( $ts && $ts['done'] ) ? '✓ ' . __( 'done', 'ars-nova-practice' ) : '○';
								if ( $ts && null !== $ts['rating'] ) {
									$bits[] = $labels[ (int) $ts['rating'] ];
								}
								if ( $ts && $ts['plays'] ) {
									/* translators: %d: plays */
									$bits[] = sprintf( __( '▶ %d×', 'ars-nova-practice' ), (int) $ts['plays'] );
								}
								if ( $ts && $ts['listen'] >= 60 ) {
									/* translators: %d: minutes */
									$bits[] = sprintf( __( '%d min listened', 'ars-nova-practice' ), (int) floor( $ts['listen'] / 60 ) );
								}
								if ( $ts && $ts['opens'] ) {
									/* translators: %d: count */
									$bits[] = sprintf( __( 'opened score %d×', 'ars-nova-practice' ), (int) $ts['opens'] );
								}
								echo esc_html( implode( ' · ', $bits ) );
								?>
							</td>
						<?php endforeach; ?>
					</tr>
				<?php endforeach; ?>
			</tbody>
		</table>
		</div>
		<p class="description"><?php esc_html_e( '"▶" counts a play when a singer listened for at least 20 seconds in one sitting. Done marks and ratings are what the singer chose; they are not checked.', 'ars-nova-practice' ); ?></p>
		</div>
		<?php
	}

	/**
	 * Settings screen.
	 */
	public static function render_settings() {
		if ( ! self::allowed() ) {
			wp_die( esc_html__( 'You do not have access to practice assignments.', 'ars-nova-practice' ) );
		}
		$mode = ANPR_Frontend::recording_mode();
		?>
		<div class="wrap anpr-admin">
			<h1><?php esc_html_e( 'Practice settings', 'ars-nova-practice' ); ?></h1>
			<?php self::notices(); ?>
			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
				<input type="hidden" name="action" value="anpr_save_settings">
				<?php wp_nonce_field( 'anpr_save_settings', 'anpr_nonce' ); ?>
				<h2><?php esc_html_e( 'Recording and saved takes', 'ars-nova-practice' ); ?></h2>
				<p class="description"><?php esc_html_e( 'Who sees Track 2 ("My take"), the Record button and Save take in the practice player. A saved take is the singer\'s voice (levelled) mixed with the practice track, stored privately in Google Cloud. The singer, Tom, Zahnay and site admins can listen to it; only the singer can rename or delete it. Nothing is deleted automatically.', 'ars-nova-practice' ); ?></p>
				<fieldset>
					<label><input type="radio" name="anpr_recording_test" value="off" <?php checked( 'off', $mode ); ?>> <?php esc_html_e( 'Off', 'ars-nova-practice' ); ?></label><br>
					<label><input type="radio" name="anpr_recording_test" value="managers" <?php checked( 'managers', $mode ); ?>> <?php esc_html_e( 'Staff only (Tom, Zahnay, admins) — for testing', 'ars-nova-practice' ); ?></label><br>
					<label><input type="radio" name="anpr_recording_test" value="everyone" <?php checked( 'everyone', $mode ); ?>> <?php esc_html_e( 'Everyone', 'ars-nova-practice' ); ?></label>
				</fieldset>
				<table class="form-table" role="presentation">
					<tr>
						<th scope="row"><?php esc_html_e( 'Saved take format', 'ars-nova-practice' ); ?></th>
						<td>
							<label><input type="radio" name="anpr_take_format" value="mp3" <?php checked( 'mp3', ANPR_Takes::format() ); ?>> <?php esc_html_e( 'MP3, 160 kbps stereo (about 1.2 MB a minute) — recommended', 'ars-nova-practice' ); ?></label><br>
							<label><input type="radio" name="anpr_take_format" value="wav" <?php checked( 'wav', ANPR_Takes::format() ); ?>> <?php esc_html_e( 'WAV, uncompressed (about 10 MB a minute)', 'ars-nova-practice' ); ?></label>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="anpr_takes_per_piece"><?php esc_html_e( 'Saved takes per piece', 'ars-nova-practice' ); ?></label></th>
						<td><input type="number" min="1" max="20" id="anpr_takes_per_piece" name="anpr_takes_per_piece" value="<?php echo esc_attr( (string) ANPR_Takes::limit() ); ?>" class="small-text"></td>
					</tr>
					<tr>
						<th scope="row"><?php esc_html_e( 'Storage', 'ars-nova-practice' ); ?></th>
						<td>
							<?php if ( ANPR_Takes::available() ) : ?>
								<?php
								/* translators: %s: staging or live */
								echo esc_html( sprintf( __( 'Connected through the Singers Hub scores service. Takes from this site go in the "%s" folder.', 'ars-nova-practice' ), ANPR_Takes::env() ) );
								?>
							<?php else : ?>
								<strong><?php esc_html_e( 'Not connected: the Singers Hub scores service is not set up, so takes cannot be saved.', 'ars-nova-practice' ); ?></strong>
							<?php endif; ?>
						</td>
					</tr>
				</table>
				<?php submit_button( __( 'Save settings', 'ars-nova-practice' ) ); ?>
			</form>
		</div>
		<?php
	}

	/**
	 * Save settings.
	 */
	public static function save_settings() {
		if ( ! self::allowed() ) {
			wp_die( esc_html__( 'You do not have access to practice assignments.', 'ars-nova-practice' ), 403 );
		}
		check_admin_referer( 'anpr_save_settings', 'anpr_nonce' );
		$mode = isset( $_POST['anpr_recording_test'] ) ? sanitize_key( wp_unslash( $_POST['anpr_recording_test'] ) ) : 'managers';
		if ( ! in_array( $mode, array( 'off', 'managers', 'everyone' ), true ) ) {
			$mode = 'managers';
		}
		update_option( 'anpr_recording_test', $mode, false );
		$format = isset( $_POST['anpr_take_format'] ) ? sanitize_key( wp_unslash( $_POST['anpr_take_format'] ) ) : 'mp3';
		update_option( 'anpr_take_format', in_array( $format, array( 'mp3', 'wav' ), true ) ? $format : 'mp3', false );
		$limit = isset( $_POST['anpr_takes_per_piece'] ) ? (int) $_POST['anpr_takes_per_piece'] : ANPR_Takes::DEFAULT_LIMIT;
		update_option( 'anpr_takes_per_piece', max( 1, min( 20, $limit ) ), false );
		wp_safe_redirect( admin_url( 'admin.php?page=' . self::SETTINGS . '&anpr_msg=settings' ) );
		exit;
	}

	/**
	 * A small box on the concert's edit screen pointing at the builder.
	 */
	public static function meta_box() {
		if ( ! self::allowed() ) {
			return;
		}
		add_meta_box(
			'anpr-practice-box',
			__( 'Weekly practice assignments', 'ars-nova-practice' ),
			array( __CLASS__, 'render_meta_box' ),
			ANSP_CPT::POST_TYPE,
			'side',
			'default'
		);
	}

	/**
	 * Meta box body.
	 *
	 * @param WP_Post $post Project.
	 */
	public static function render_meta_box( $post ) {
		$weeks     = ANPR_Weeks::get( $post->ID );
		$published = 0;
		foreach ( $weeks as $w ) {
			if ( 'published' === $w['status'] ) {
				++$published;
			}
		}
		echo '<p>';
		if ( $weeks ) {
			/* translators: 1: weeks, 2: published weeks */
			echo esc_html( sprintf( __( '%1$d weeks, %2$d published.', 'ars-nova-practice' ), count( $weeks ), $published ) );
		} else {
			esc_html_e( 'No practice weeks yet.', 'ars-nova-practice' );
		}
		echo '</p><p><a class="button" href="' . esc_url( admin_url( 'admin.php?page=' . self::SLUG . '&project=' . $post->ID ) ) . '">' . esc_html__( 'Open the weekly builder', 'ars-nova-practice' ) . '</a></p>';
		if ( $weeks ) {
			echo '<p><a href="' . esc_url( admin_url( 'admin.php?page=' . self::PROGRESS . '&project=' . $post->ID ) ) . '">' . esc_html__( 'Progress report', 'ars-nova-practice' ) . '</a></p>';
		}
	}
}
