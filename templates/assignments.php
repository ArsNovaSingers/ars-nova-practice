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
		$tasks      = array();
		foreach ( $week['tasks'] as $task ) {
			if ( $data['is_manager'] || ANPR_Weeks::task_is_for( $task, $data['parts'] ) ) {
				$tasks[] = $task;
			}
		}
		$minutes = 0;
		$rated   = array();
		$scores  = array();
		$secs    = 0;
		foreach ( $tasks as $task ) {
			$minutes += (int) $task['minutes'];
			$conf_t   = ANPR_Tracking::confidence_of( isset( $block['progress'][ $task['id'] ] ) ? $block['progress'][ $task['id'] ] : null );
			if ( null !== $conf_t ) {
				$rated[] = $conf_t;
			}
			// 0.7.0 (Jonathan): a task nobody has started is a zero, not a gap.
			// Skipping a task used to cost nothing; now it pulls the week down.
			$scores[] = null === $conf_t ? 0 : $conf_t;
			$secs    += isset( $block['seconds'][ $task['id'] ] ) ? (int) $block['seconds'][ $task['id'] ] : 0;
		}
		$avg = ANPR_Tracking::week_score( $scores );
		$total = count( $tasks );
		$due   = ANPR_Frontend::date_label( $week['due_date'] );
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
			</header>

			<?php
			/*
			 * The week at a glance (0.5.0, Jonathan): tasks done as a bar, time
			 * rehearsed (listening + recording) and the average of the singer's
			 * own "How is it going?" answers. Tom sees the same three figures per
			 * singer in Practice → Progress.
			 */
			?>
			<div class="anpr-summary" data-anpr-summary
				data-anpr-total="<?php echo esc_attr( (string) $total ); ?>"
				data-anpr-secs="<?php echo esc_attr( (string) $secs ); ?>">
				<div class="anpr-stat anpr-stat--grade" style="--anpr-conf: <?php echo esc_attr( (string) ( null === $avg ? 0 : $avg ) ); ?>;">
					<span class="anpr-stat-label"><?php esc_html_e( 'Your grade', 'ars-nova-practice' ); ?></span>
					<span class="anpr-grade" data-anpr-grade><?php echo esc_html( ANPR_Tracking::grade( $avg ) ); ?></span>
					<span class="anpr-stat-note"><?php esc_html_e( 'every task counts — one you have not started counts as a zero', 'ars-nova-practice' ); ?></span>
				</div>
				<div class="anpr-stat anpr-stat--going" style="--anpr-conf: <?php echo esc_attr( (string) ( null === $avg ? 0 : $avg ) ); ?>;">
					<span class="anpr-stat-label"><?php esc_html_e( 'How it is going', 'ars-nova-practice' ); ?></span>
					<span class="anpr-stat-value" data-anpr-avg><?php echo esc_html( null === $avg ? '—' : $avg . '%' ); ?></span>
					<span class="anpr-bar" aria-hidden="true"><span class="anpr-bar-fill" data-anpr-bar style="width: <?php echo esc_attr( (string) min( 100, null === $avg ? 0 : $avg ) ); ?>%"></span></span>
					<span class="anpr-stat-note" data-anpr-avgnote><?php echo esc_html( ANPR_Tracking::confidence_label( $avg ) ); ?></span>
				</div>
				<div class="anpr-stat anpr-stat--time">
					<span class="anpr-stat-label"><?php esc_html_e( 'Time rehearsed', 'ars-nova-practice' ); ?></span>
					<span class="anpr-stat-value" data-anpr-time><?php echo esc_html( ANPR_Frontend::minutes_label( $secs ) ); ?></span>
					<span class="anpr-stat-note">
						<?php
						if ( $minutes ) {
							/* translators: %d: minutes */
							echo esc_html( sprintf( __( 'about %d min of work set', 'ars-nova-practice' ), $minutes ) );
						}
						?>
					</span>
				</div>
				<div class="anpr-stat anpr-stat--said">
					<span class="anpr-stat-label"><?php esc_html_e( 'Tasks you have rated', 'ars-nova-practice' ); ?></span>
					<span class="anpr-stat-value" data-anpr-donecount><?php echo esc_html( count( $rated ) . ' / ' . $total ); ?></span>
					<span class="anpr-sr" aria-live="polite" data-anpr-donesr><?php echo esc_html( sprintf( /* translators: 1: rated, 2: total */ __( '%1$d of %2$d tasks rated', 'ars-nova-practice' ), count( $rated ), $total ) ); ?></span>
				</div>
			</div>

			<?php
			$wvid = ANPR_Frontend::video_embed( isset( $week['video'] ) ? $week['video'] : '' );
			if ( '' !== $wvid['url'] ) :
				?>
				<div class="anpr-video">
					<p class="anpr-video-label"><?php esc_html_e( 'This week on video', 'ars-nova-practice' ); ?></p>
					<?php if ( '' !== $wvid['embed'] ) : ?>
						<div class="anpr-video-frame">
							<iframe src="<?php echo esc_url( $wvid['embed'] ); ?>" title="<?php esc_attr_e( 'Video from the director', 'ars-nova-practice' ); ?>" loading="lazy" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; encrypted-media; picture-in-picture; fullscreen"></iframe>
						</div>
					<?php else : ?>
						<p><a class="anpr-btn" href="<?php echo esc_url( $wvid['url'] ); ?>" target="_blank" rel="noopener noreferrer"><?php esc_html_e( 'Watch the video', 'ars-nova-practice' ); ?></a></p>
					<?php endif; ?>
				</div>
			<?php endif; ?>

			<?php
			/*
			 * The week's note from Tom. The weekly builder has had this field since
			 * 0.1.0 and the singer's page never printed it — it was lost in the 0.5.0
			 * restructure and found on 2026-09-18, when a 0.8.0 test counted one
			 * "From the director" box on a page that should have had two. Anything
			 * Tom wrote to the choir at week level went nowhere.
			 */
			if ( '' !== ( isset( $week['note'] ) ? $week['note'] : '' ) ) :
				?>
				<div class="anpr-note anpr-note--week">
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
						$conf     = ANPR_Tracking::confidence_of( $prog );
						$plays    = isset( $block['plays'][ $task['id'] ] ) ? (int) $block['plays'][ $task['id'] ] : 0;
						$dom      = 'anpr-' . $week['id'] . '-' . $task['id'];
						?>
						<li class="anpr-task<?php echo ( null !== $conf && $conf >= 100 ) ? ' is-proud' : ''; ?>"
							data-anpr-task="<?php echo esc_attr( $task['id'] ); ?>"
							data-anpr-week="<?php echo esc_attr( $week['id'] ); ?>"
							data-anpr-project="<?php echo esc_attr( (string) $project_id ); ?>">
							<div class="anpr-task-head">
								<button type="button" class="anpr-task-toggle" data-anpr-task-toggle
									aria-expanded="<?php echo $current && 0 === $i ? 'true' : 'false'; ?>"
									aria-controls="<?php echo esc_attr( $dom . '-body' ); ?>">
									<span class="anpr-chev" aria-hidden="true"></span>
									<span class="anpr-task-titles">
										<span class="anpr-task-title">
											<span class="anpr-task-num"><?php echo esc_html( (string) ( $i + 1 ) ); ?>.</span>
											<?php echo esc_html( $task['title'] ); ?>
										</span>
										<span class="anpr-task-meta">
											<?php
											$meta = array();
											if ( $task['minutes'] ) {
												/* translators: %d: minutes */
												$meta[] = sprintf( __( '%d min', 'ars-nova-practice' ), (int) $task['minutes'] );
											}
											$meta[] = empty( $task['parts'] ) ? __( 'Everyone', 'ars-nova-practice' ) : implode( ', ', $task['parts'] );
											$tsecs  = isset( $block['seconds'][ $task['id'] ] ) ? (int) $block['seconds'][ $task['id'] ] : 0;
											if ( $tsecs >= 60 ) {
												$meta[] = ANPR_Frontend::minutes_label( $tsecs );
											}
											echo esc_html( implode( ' · ', $meta ) );
											?>
										</span>
									</span>
								</button>
								<?php
								/*
								 * 0.6.0 (Jonathan): the Done switch is gone. One slider says how
								 * it is going, 0 to 111%, red through amber to green, with a
								 * sentence that grows in confidence. 111% features the singer's
								 * newest take for this piece on their Hub bio.
								 */
								?>
								<div class="anpr-conf<?php echo null === $conf ? ' is-unset' : ''; ?>" style="--anpr-conf: <?php echo esc_attr( (string) ( null === $conf ? 0 : $conf ) ); ?>;">
									<output class="anpr-conf-say" for="<?php echo esc_attr( $dom . '-rate' ); ?>" data-anpr-say><?php echo esc_html( ANPR_Tracking::confidence_label( $conf ) ); ?></output>
									<div class="anpr-conf-row">
										<input type="range" id="<?php echo esc_attr( $dom . '-rate' ); ?>" min="0" max="111" step="1"
											value="<?php echo esc_attr( (string) ( null === $conf ? 0 : $conf ) ); ?>"
											data-anpr-rate data-rated="<?php echo null === $conf ? '0' : '1'; ?>"
											aria-label="<?php echo esc_attr( sprintf( /* translators: %s: task title */ __( 'How is it going: %s', 'ars-nova-practice' ), $task['title'] ) ); ?>"
											aria-valuetext="<?php echo esc_attr( ANPR_Tracking::confidence_label( $conf ) . ( null === $conf ? '' : ' — ' . $conf . '%' ) ); ?>">
										<span class="anpr-conf-num" data-anpr-num><?php echo esc_html( null === $conf ? '—' : $conf . '%' ); ?></span>
									</div>
								</div>
							</div>

							<div class="anpr-task-body" id="<?php echo esc_attr( $dom . '-body' ); ?>" <?php echo $current && 0 === $i ? '' : 'hidden'; ?>>
								<?php if ( ! empty( $mats['links'] ) ) : ?>
									<div class="anpr-task-links">
										<?php foreach ( $mats['links'] as $link ) : ?>
											<span class="anpr-openfile">
												<?php if ( empty( $link['pending'] ) ) : ?>
													<a class="anpr-btn anpr-btn--quiet" href="<?php echo esc_url( $link['url'] ); ?>" target="_blank" rel="noopener noreferrer" data-anpr-open="<?php echo esc_attr( $link['id'] ); ?>">
														<?php echo esc_html( 'sheet_music' === $link['type'] ? __( 'Open score PDF', 'ars-nova-practice' ) : __( 'Open file', 'ars-nova-practice' ) ); ?>
													</a>
												<?php else : ?>
													<span class="anpr-btn anpr-btn--quiet is-pending" aria-disabled="true"><?php esc_html_e( 'Score not ready', 'ars-nova-practice' ); ?></span>
												<?php endif; ?>
												<span class="anpr-openfile-name" title="<?php echo esc_attr( $link['title'] ); ?>"><?php echo esc_html( $link['title'] ); ?></span>
												<?php if ( ! empty( $link['pending'] ) ) : ?>
													<span class="anpr-openfile-note"><?php esc_html_e( 'The link is still being prepared. Reload the page in a moment.', 'ars-nova-practice' ); ?></span>
												<?php endif; ?>
											</span>
										<?php endforeach; ?>
									</div>
								<?php endif; ?>

								<?php
								$tvid = ANPR_Frontend::video_embed( isset( $task['video'] ) ? $task['video'] : '' );
								if ( '' !== $tvid['url'] ) :
									?>
									<div class="anpr-video anpr-video--task">
										<?php if ( '' !== $tvid['embed'] ) : ?>
											<div class="anpr-video-frame">
												<iframe src="<?php echo esc_url( $tvid['embed'] ); ?>" title="<?php esc_attr_e( 'Video for this task', 'ars-nova-practice' ); ?>" loading="lazy" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; encrypted-media; picture-in-picture; fullscreen"></iframe>
											</div>
										<?php else : ?>
											<p><a class="anpr-btn" href="<?php echo esc_url( $tvid['url'] ); ?>" target="_blank" rel="noopener noreferrer"><?php esc_html_e( 'Watch the video', 'ars-nova-practice' ); ?></a></p>
										<?php endif; ?>
									</div>
								<?php endif; ?>

								<?php if ( '' !== $task['detail'] ) : ?>
									<div class="anpr-task-detail"><?php echo wp_kses_post( wpautop( esc_html( $task['detail'] ) ) ); ?></div>
								<?php endif; ?>

								<?php if ( '' !== ( isset( $task['note'] ) ? $task['note'] : '' ) ) : ?>
									<div class="anpr-note anpr-note--task">
										<p class="anpr-note-label"><?php esc_html_e( 'From the director', 'ars-nova-practice' ); ?></p>
										<?php echo wp_kses_post( wpautop( esc_html( $task['note'] ) ) ); ?>
									</div>
								<?php endif; ?>

								<?php
								$lanes = array_merge( array_slice( $mats['tracks'], 0, 1 ), $mats['examples'] );
								if ( $lanes ) :
									?>
									<div class="anpr-practice">
										<?php
										/*
										 * One practice track per task (Jonathan, 2026-09-17): the
										 * recorder is the task, so it opens with the task and there
										 * is no separate button. A task that still carries more than
										 * one track shows the first and tells managers to split it.
										 */
										?>
										<div class="anpr-player-host" data-anpr-track-index="0" id="<?php echo esc_attr( $dom . '-player' ); ?>"></div>
										<?php if ( $mats['examples'] ) : ?>
											<p class="anpr-example-note">
												<?php echo esc_html( _n( 'The A+ example starts muted — press M on its track to hear it. It is never mixed into a take you save.', 'The A+ examples start muted — press M on a track to hear it. They are never mixed into a take you save.', count( $mats['examples'] ), 'ars-nova-practice' ) ); ?>
											</p>
										<?php endif; ?>
										<div class="anpr-practice-bar">
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
										<?php if ( count( $mats['tracks'] ) > 1 && $data['is_manager'] ) : ?>
											<p class="anpr-staff-badge">
												<?php esc_html_e( 'This task has more than one practice track. Singers see the first one. Give each track its own task in the weekly builder.', 'ars-nova-practice' ); ?>
											</p>
										<?php endif; ?>
										<script type="application/json" data-anpr-tracks><?php echo wp_json_encode( $lanes, JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_SLASHES ); ?></script>
										<?php
										// Takes belong to the practice track's piece, not an example's.
										$task_takes = array();
										foreach ( array_slice( $mats['tracks'], 0, 1 ) as $track ) {
											$task_takes[ $track['piece'] ] = isset( $block['takes'][ $track['piece'] ] ) ? $block['takes'][ $track['piece'] ] : array();
										}
										?>
										<script type="application/json" data-anpr-takes><?php echo wp_json_encode( (object) $task_takes, JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_SLASHES ); ?></script>
									</div>
								<?php endif; ?>

								<?php if ( null !== $conf && ANPR_Tracking::MAX_CONFIDENCE === $conf ) : ?>
									<p class="anpr-shared" data-anpr-shared><?php esc_html_e( 'Your newest take for this piece is featured on your bio for the choir to hear.', 'ars-nova-practice' ); ?></p>
								<?php endif; ?>

								<p class="anpr-task-error" role="alert" hidden></p>
							</div>
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
		<?php esc_html_e( 'Open a task to work on it: the practice track, the recorder and the rest are inside. Slide "How is it going?" as you improve — and at 111% your newest take for that piece is featured on your bio for the choir to hear. Your grade is the average across every task in the week, so one you have not started counts as a zero. Tom, Zahnay and the site admins can see how it is going and how long you have rehearsed.', 'ars-nova-practice' ); ?>
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
