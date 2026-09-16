<?php
/**
 * "This Week's Assignments", practice version.
 *
 * Loaded by the Hub through `ansp_template_file` (see ANPR_Frontend). In
 * scope: $ansp_group_slug, $ansp_group_name.
 *
 * Layout, top to bottom, per project: the current week open, then "Coming up"
 * and "Earlier weeks" folded away. A singer lands on this week's homework and
 * nothing else competes for the screen.
 *
 * @package ArsNovaPractice
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$anpr_slug = isset( $ansp_group_slug ) ? sanitize_key( (string) $ansp_group_slug ) : '';
$anpr_data = ANPR_Frontend::data_for( $anpr_slug );

wp_enqueue_style( 'anpr-practice' );
wp_enqueue_script( 'anpr-practice' );

if ( empty( $anpr_data['projects'] ) ) {
	// Only managers reach this branch (see ANPR_Frontend::template). They get a
	// pointer to the builder, then the Hub's original page underneath.
	?>
	<p class="anpr-staff-hint">
		<?php
		printf(
			/* translators: %s: link to the Practice builder */
			esc_html__( 'Staff only: no practice weeks are published for this ensemble yet. Build them under %s in wp-admin. Singers see the page below until then.', 'ars-nova-practice' ),
			'<a href="' . esc_url( admin_url( 'admin.php?page=anpr-practice' ) ) . '">' . esc_html__( 'Practice', 'ars-nova-practice' ) . '</a>'
		);
		?>
	</p>
	<?php
	$anpr_original = ANPR_Frontend::original_template( $anpr_slug );
	if ( '' !== $anpr_original && file_exists( $anpr_original ) ) {
		include $anpr_original;
	}
	return;
}

$anpr_labels = ANPR_Tracking::rating_labels();
$anpr_multi  = count( $anpr_data['projects'] ) > 1;

if ( ! function_exists( 'anpr_render_week' ) ) {
	/**
	 * One week card.
	 *
	 * @param array $week    Week.
	 * @param array $block   Project block from data_for().
	 * @param array $data    Tab data.
	 * @param bool  $current Is this the current week.
	 */
	function anpr_render_week( $week, $block, $data, $current ) {
		$project_id = (int) $block['project']->ID;
		$labels     = ANPR_Tracking::rating_labels();
		$tasks      = array();
		foreach ( $week['tasks'] as $task ) {
			if ( $data['is_manager'] || ANPR_Weeks::task_is_for( $task, $data['parts'] ) ) {
				$tasks[] = $task;
			}
		}
		$done    = 0;
		$minutes = 0;
		foreach ( $tasks as $task ) {
			$minutes += (int) $task['minutes'];
			if ( ! empty( $block['progress'][ $task['id'] ]['done'] ) ) {
				++$done;
			}
		}
		$total = count( $tasks );
		$due   = ANPR_Frontend::date_label( $week['due_date'] );
		$pct   = $total ? round( 100 * $done / $total ) : 0;
		?>
		<article class="anpr-week<?php echo $current ? ' is-current' : ''; ?>"
			data-anpr-week="<?php echo esc_attr( $week['id'] ); ?>"
			data-anpr-project="<?php echo esc_attr( (string) $project_id ); ?>"
			<?php echo $current ? 'data-anpr-current' : ''; ?>>
			<header class="anpr-week-header">
				<div class="anpr-week-head">
					<?php if ( '' !== $due || '' !== $week['due_label'] ) : ?>
						<p class="anpr-kicker">
							<?php
							if ( '' !== $due ) {
								/* translators: %s: date */
								echo esc_html( sprintf( __( 'Have ready by %s', 'ars-nova-practice' ), $due ) );
								if ( '' !== $week['due_label'] ) {
									echo ' · ';
								}
							}
							echo esc_html( $week['due_label'] );
							?>
						</p>
					<?php endif; ?>
					<h4 class="anpr-week-title"><?php echo esc_html( '' !== $week['title'] ? $week['title'] : __( 'Practice', 'ars-nova-practice' ) ); ?></h4>
					<p class="anpr-week-meta">
						<?php
						$bits = array();
						if ( $minutes ) {
							/* translators: %d: minutes */
							$bits[] = sprintf( _n( 'About %d minute', 'About %d minutes', $minutes, 'ars-nova-practice' ), $minutes );
						}
						/* translators: %d: number of tasks */
						$bits[] = sprintf( _n( '%d task', '%d tasks', $total, 'ars-nova-practice' ), $total );
						echo esc_html( implode( ' · ', $bits ) );
						?>
					</p>
				</div>
				<div class="anpr-ring" style="--anpr-pct: <?php echo esc_attr( (string) $pct ); ?>;" data-anpr-ring data-done="<?php echo esc_attr( (string) $done ); ?>" data-total="<?php echo esc_attr( (string) $total ); ?>">
					<span class="anpr-ring-text" aria-live="polite"><?php echo esc_html( $done . '/' . $total ); ?></span>
					<span class="anpr-sr"><?php echo esc_html( sprintf( /* translators: 1: done, 2: total */ __( '%1$d of %2$d done', 'ars-nova-practice' ), $done, $total ) ); ?></span>
				</div>
			</header>

			<?php if ( ! empty( $week['staff_only'] ) ) : ?>
				<p class="anpr-staff-badge">
					<?php
					if ( 'published' !== $week['status'] ) {
						esc_html_e( 'Draft — only staff can see this week.', 'ars-nova-practice' );
					} else {
						/* translators: %s: date */
						echo esc_html( sprintf( __( 'Singers see this week from %s. Only staff can see it now.', 'ars-nova-practice' ), ANPR_Frontend::date_label( $week['show_from'] ) ) );
					}
					?>
				</p>
			<?php endif; ?>

			<?php if ( '' !== $week['note'] ) : ?>
				<div class="anpr-note">
					<p class="anpr-note-label"><?php esc_html_e( 'From the director', 'ars-nova-practice' ); ?></p>
					<?php echo wp_kses_post( wpautop( esc_html( $week['note'] ) ) ); ?>
				</div>
			<?php endif; ?>

			<?php if ( empty( $tasks ) ) : ?>
				<p class="anpr-empty"><?php esc_html_e( 'No tasks for your part this week.', 'ars-nova-practice' ); ?></p>
			<?php else : ?>
				<ol class="anpr-tasks">
					<?php foreach ( $tasks as $i => $task ) : ?>
						<?php
						$mats     = ANPR_Frontend::task_materials( $task, $block['materials'], $project_id, $data['parts'], $data['is_manager'] );
						$prog     = isset( $block['progress'][ $task['id'] ] ) ? $block['progress'][ $task['id'] ] : null;
						$is_done  = $prog && ! empty( $prog['done'] );
						$rating   = ( $prog && null !== $prog['rating'] && '' !== $prog['rating'] ) ? (int) $prog['rating'] : null;
						$plays    = isset( $block['plays'][ $task['id'] ] ) ? (int) $block['plays'][ $task['id'] ] : 0;
						$dom      = 'anpr-' . $week['id'] . '-' . $task['id'];
						?>
						<li class="anpr-task<?php echo $is_done ? ' is-done' : ''; ?>"
							data-anpr-task="<?php echo esc_attr( $task['id'] ); ?>"
							data-anpr-week="<?php echo esc_attr( $week['id'] ); ?>"
							data-anpr-project="<?php echo esc_attr( (string) $project_id ); ?>">
							<div class="anpr-task-head">
								<label class="anpr-done">
									<input type="checkbox" data-anpr-done <?php checked( $is_done ); ?>>
									<span class="anpr-done-box" aria-hidden="true"></span>
									<span class="anpr-sr"><?php echo esc_html( sprintf( /* translators: %s: task title */ __( 'Mark "%s" done', 'ars-nova-practice' ), $task['title'] ) ); ?></span>
								</label>
								<div class="anpr-task-titles">
									<h5 class="anpr-task-title">
										<span class="anpr-task-num"><?php echo esc_html( (string) ( $i + 1 ) ); ?>.</span>
										<?php echo esc_html( $task['title'] ); ?>
									</h5>
									<?php
									$meta = array();
									if ( $task['minutes'] ) {
										/* translators: %d: minutes */
										$meta[] = sprintf( __( '%d min', 'ars-nova-practice' ), (int) $task['minutes'] );
									}
									$meta[] = empty( $task['parts'] ) ? __( 'Everyone', 'ars-nova-practice' ) : implode( ', ', $task['parts'] );
									?>
									<p class="anpr-task-meta"><?php echo esc_html( implode( ' · ', $meta ) ); ?></p>
								</div>
							</div>

							<?php if ( '' !== $task['detail'] ) : ?>
								<div class="anpr-task-detail"><?php echo wp_kses_post( wpautop( esc_html( $task['detail'] ) ) ); ?></div>
							<?php endif; ?>

							<?php if ( ! empty( $mats['links'] ) ) : ?>
								<p class="anpr-task-links">
									<?php foreach ( $mats['links'] as $link ) : ?>
										<a class="anpr-btn anpr-link" href="<?php echo esc_url( $link['url'] ); ?>" target="_blank" rel="noopener noreferrer" data-anpr-open="<?php echo esc_attr( $link['id'] ); ?>">
											<?php echo esc_html( $link['title'] ); ?>
										</a>
									<?php endforeach; ?>
								</p>
							<?php endif; ?>

							<?php if ( ! empty( $mats['tracks'] ) ) : ?>
								<div class="anpr-practice">
									<div class="anpr-practice-bar">
										<button type="button" class="anpr-btn anpr-btn--primary" data-anpr-player-toggle aria-expanded="false" aria-controls="<?php echo esc_attr( $dom . '-player' ); ?>">
											<?php
											/* translators: %d: number of tracks */
											echo esc_html( sprintf( _n( 'Practice track', 'Practice tracks (%d)', count( $mats['tracks'] ), 'ars-nova-practice' ), count( $mats['tracks'] ) ) );
											?>
										</button>
										<span class="anpr-plays" data-anpr-plays="<?php echo esc_attr( (string) $plays ); ?>">
											<?php
											echo esc_html(
												$plays
													/* translators: %d: play count */
													? sprintf( __( 'Played %d×', 'ars-nova-practice' ), $plays )
													: __( 'Not played yet', 'ars-nova-practice' )
											);
											?>
										</span>
									</div>
									<div class="anpr-player-host" id="<?php echo esc_attr( $dom . '-player' ); ?>" hidden></div>
									<script type="application/json" data-anpr-tracks><?php echo wp_json_encode( $mats['tracks'], JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_SLASHES ); ?></script>
								</div>
							<?php endif; ?>

							<div class="anpr-rating<?php echo null === $rating ? ' is-unrated' : ''; ?>">
								<label class="anpr-rating-label" for="<?php echo esc_attr( $dom . '-rate' ); ?>"><?php esc_html_e( 'How is it going?', 'ars-nova-practice' ); ?></label>
								<input type="range" id="<?php echo esc_attr( $dom . '-rate' ); ?>" min="0" max="3" step="1"
									value="<?php echo esc_attr( (string) ( null === $rating ? 1 : $rating ) ); ?>"
									data-anpr-rate data-rated="<?php echo null === $rating ? '0' : '1'; ?>"
									aria-valuetext="<?php echo esc_attr( null === $rating ? __( 'Not rated yet', 'ars-nova-practice' ) : $labels[ $rating ] ); ?>">
								<div class="anpr-rating-scale" aria-hidden="true">
									<?php foreach ( $labels as $label ) : ?>
										<span><?php echo esc_html( $label ); ?></span>
									<?php endforeach; ?>
								</div>
								<output class="anpr-rating-out" for="<?php echo esc_attr( $dom . '-rate' ); ?>">
									<?php echo esc_html( null === $rating ? __( 'Not rated yet', 'ars-nova-practice' ) : $labels[ $rating ] ); ?>
								</output>
							</div>

							<p class="anpr-task-error" role="alert" hidden></p>
						</li>
					<?php endforeach; ?>
				</ol>
			<?php endif; ?>
		</article>
		<?php
	}
}
?>
<div class="anpr-page" data-anpr-page>
	<p class="anpr-privacy">
		<?php esc_html_e( 'Tick each task when it is done and say how it is going. Tom, Zahnay and the site admins can see your ticks, your ratings and how often you play the practice tracks.', 'ars-nova-practice' ); ?>
	</p>

	<?php foreach ( $anpr_data['projects'] as $anpr_block ) : ?>
		<?php
		$anpr_current  = null;
		$anpr_earlier  = array();
		$anpr_upcoming = array();
		$anpr_seen     = false;
		foreach ( $anpr_block['weeks'] as $anpr_week ) {
			if ( $anpr_week['id'] === $anpr_block['current'] ) {
				$anpr_current = $anpr_week;
				$anpr_seen    = true;
			} elseif ( $anpr_seen ) {
				$anpr_upcoming[] = $anpr_week;
			} else {
				$anpr_earlier[] = $anpr_week;
			}
		}
		$anpr_earlier = array_reverse( $anpr_earlier );
		?>
		<section class="anpr-project">
			<?php if ( $anpr_multi ) : ?>
				<h3 class="anpr-project-title"><?php echo esc_html( get_the_title( $anpr_block['project'] ) ); ?></h3>
			<?php endif; ?>

			<?php
			if ( $anpr_current ) {
				anpr_render_week( $anpr_current, $anpr_block, $anpr_data, true );
			}
			?>

			<?php if ( $anpr_upcoming ) : ?>
				<details class="anpr-more">
					<summary><?php echo esc_html( sprintf( /* translators: %d: count */ _n( 'Coming up (%d week)', 'Coming up (%d weeks)', count( $anpr_upcoming ), 'ars-nova-practice' ), count( $anpr_upcoming ) ) ); ?></summary>
					<?php
					foreach ( $anpr_upcoming as $anpr_week ) {
						anpr_render_week( $anpr_week, $anpr_block, $anpr_data, false );
					}
					?>
				</details>
			<?php endif; ?>

			<?php if ( $anpr_earlier ) : ?>
				<details class="anpr-more">
					<summary><?php echo esc_html( sprintf( /* translators: %d: count */ _n( 'Earlier weeks (%d)', 'Earlier weeks (%d)', count( $anpr_earlier ), 'ars-nova-practice' ), count( $anpr_earlier ) ) ); ?></summary>
					<?php
					foreach ( $anpr_earlier as $anpr_week ) {
						anpr_render_week( $anpr_week, $anpr_block, $anpr_data, false );
					}
					?>
				</details>
			<?php endif; ?>
		</section>
	<?php endforeach; ?>

	<p class="anpr-footnote">
		<?php esc_html_e( 'Rehearsal notes and every score and recording are under Program Materials.', 'ars-nova-practice' ); ?>
	</p>
</div>
