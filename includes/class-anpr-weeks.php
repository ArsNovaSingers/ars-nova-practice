<?php
/**
 * Weeks and tasks: storage, cleaning, and "what does this singer see".
 *
 * STORAGE. A project's weeks are one array in post meta `_anpr_weeks`, in the
 * order the builder shows them. Each week and each task has a short random id
 * that never changes, because progress rows and events point at those ids —
 * renaming a task or moving it must not lose anyone's ticks.
 *
 *   week: id, title, due_date (Y-m-d), due_label, show_from (Y-m-d), note,
 *         status (draft|published), tasks[]
 *   task: id, title, detail, minutes, parts[] (voice parts; empty = everyone),
 *         materials[]
 *   material: id (a Hub material row id), role (track|example|open), part, pan
 *         (left|center|right), muted (bool), and a title/piece/type
 *         snapshot used to find the row again if the Hub changes its id
 *
 * PERMISSIONS. Nothing here decides who may see a file. A task only ever
 * points at Hub material ids, and every time a page is drawn those ids are
 * looked up inside ANSP_Permissions::get_visible_materials() for the viewer.
 * An id the viewer may not see is simply skipped.
 *
 * @package ArsNovaPractice
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Weeks helper.
 */
class ANPR_Weeks {

	const META = '_anpr_weeks';

	/**
	 * A new short id.
	 *
	 * @param string $prefix 'w' or 't'.
	 * @return string
	 */
	public static function new_id( $prefix ) {
		return $prefix . strtolower( wp_generate_password( 10, false, false ) );
	}

	/**
	 * All weeks of a project, cleaned, in stored order.
	 *
	 * @param int $project_id Project ID.
	 * @return array[]
	 */
	public static function get( $project_id ) {
		$raw = get_post_meta( (int) $project_id, self::META, true );
		if ( is_string( $raw ) && '' !== $raw ) {
			$raw = json_decode( $raw, true );
		}
		return is_array( $raw ) ? self::sanitize_weeks( $raw ) : array();
	}

	/**
	 * Save a project's weeks.
	 *
	 * @param int   $project_id Project ID.
	 * @param array $weeks      Weeks as posted by the builder.
	 * @return array[] What was stored.
	 */
	public static function save( $project_id, $weeks ) {
		$clean = self::sanitize_weeks( is_array( $weeks ) ? $weeks : array() );
		if ( empty( $clean ) ) {
			delete_post_meta( (int) $project_id, self::META );
		} else {
			// Stored as JSON so an unexpected character can never break
			// unserialize() and take every week with it.
			update_post_meta( (int) $project_id, self::META, wp_slash( wp_json_encode( $clean ) ) );
		}
		return $clean;
	}

	/**
	 * Clean a list of weeks.
	 *
	 * @param array $weeks Raw weeks.
	 * @return array[]
	 */
	public static function sanitize_weeks( $weeks ) {
		$out  = array();
		$seen = array();
		foreach ( (array) $weeks as $w ) {
			if ( ! is_array( $w ) ) {
				continue;
			}
			$id = isset( $w['id'] ) ? self::clean_id( $w['id'], 'w' ) : '';
			if ( '' === $id || isset( $seen[ $id ] ) ) {
				$id = self::new_id( 'w' );
			}
			$seen[ $id ] = true;

			$tasks = array();
			foreach ( ( isset( $w['tasks'] ) && is_array( $w['tasks'] ) ) ? $w['tasks'] : array() as $t ) {
				$task = self::sanitize_task( $t, $seen );
				if ( $task ) {
					$seen[ $task['id'] ] = true;
					$tasks[]             = $task;
				}
			}

			$out[] = array(
				'id'        => $id,
				'title'     => isset( $w['title'] ) ? sanitize_text_field( (string) $w['title'] ) : '',
				'due_date'  => self::clean_date( isset( $w['due_date'] ) ? $w['due_date'] : '' ),
				'due_label' => isset( $w['due_label'] ) ? sanitize_text_field( (string) $w['due_label'] ) : '',
				'show_from' => self::clean_date( isset( $w['show_from'] ) ? $w['show_from'] : '' ),
				'note'      => isset( $w['note'] ) ? sanitize_textarea_field( (string) $w['note'] ) : '',
				'video'     => self::clean_video( isset( $w['video'] ) ? $w['video'] : '' ),
				'status'    => ( isset( $w['status'] ) && 'published' === $w['status'] ) ? 'published' : 'draft',
				'tasks'     => $tasks,
			);
		}
		return $out;
	}

	/**
	 * Clean one task.
	 *
	 * @param mixed $t    Raw task.
	 * @param array $seen Ids already used.
	 * @return array|null
	 */
	protected static function sanitize_task( $t, $seen ) {
		if ( ! is_array( $t ) ) {
			return null;
		}
		$title = isset( $t['title'] ) ? sanitize_text_field( (string) $t['title'] ) : '';
		$id    = isset( $t['id'] ) ? self::clean_id( $t['id'], 't' ) : '';
		if ( '' === $id || isset( $seen[ $id ] ) ) {
			$id = self::new_id( 't' );
		}

		$valid_parts = function_exists( 'ansp_voice_part_options' ) ? ansp_voice_part_options() : array();
		$parts       = array();
		foreach ( ( isset( $t['parts'] ) && is_array( $t['parts'] ) ) ? $t['parts'] : array() as $p ) {
			$p = (string) $p;
			if ( in_array( $p, $valid_parts, true ) && ! in_array( $p, $parts, true ) ) {
				$parts[] = $p;
			}
		}

		$materials = array();
		$mseen     = array();
		foreach ( ( isset( $t['materials'] ) && is_array( $t['materials'] ) ) ? $t['materials'] : array() as $m ) {
			if ( ! is_array( $m ) || empty( $m['id'] ) ) {
				continue;
			}
			$mid = sanitize_key( (string) $m['id'] );
			if ( '' === $mid || isset( $mseen[ $mid ] ) ) {
				continue;
			}
			$mseen[ $mid ] = true;
			$part          = isset( $m['part'] ) ? (string) $m['part'] : '';
			$pan           = isset( $m['pan'] ) ? (string) $m['pan'] : 'center';
			$materials[]   = array(
				'id'    => $mid,
				// 0.8.0: 'example' is an A+ model recording Tom attaches beside the
				// practice track. It plays as its own lane and is never mixed into
				// a saved take.
				'role'  => ( isset( $m['role'] ) && in_array( (string) $m['role'], array( 'track', 'example' ), true ) ) ? (string) $m['role'] : 'open',
				'part'  => in_array( $part, $valid_parts, true ) ? $part : '',
				'pan'   => in_array( $pan, array( 'left', 'center', 'right' ), true ) ? $pan : 'center',
				'muted' => ! empty( $m['muted'] ),
				// Snapshot of what was attached, used only to find the row again
				// when its id changes (see resolve_material()).
				'title' => isset( $m['title'] ) ? sanitize_text_field( (string) $m['title'] ) : '',
				'piece' => isset( $m['piece'] ) ? sanitize_text_field( (string) $m['piece'] ) : '',
				'type'  => isset( $m['type'] ) ? sanitize_key( (string) $m['type'] ) : '',
			);
		}

		if ( '' === $title && empty( $materials ) ) {
			return null;
		}

		return array(
			'id'        => $id,
			'title'     => $title,
			'detail'    => isset( $t['detail'] ) ? sanitize_textarea_field( (string) $t['detail'] ) : '',
			// 0.8.0 (Jonathan): Tom's own space on a task — as much or as little as
			// he wants, shown in the same "From the director" box as the week note.
			'note'      => isset( $t['note'] ) ? sanitize_textarea_field( (string) $t['note'] ) : '',
			'video'     => self::clean_video( isset( $t['video'] ) ? $t['video'] : '' ),
			'minutes'   => isset( $t['minutes'] ) ? max( 0, min( 600, (int) $t['minutes'] ) ) : 0,
			'parts'     => $parts,
			'materials' => $materials,
		);
	}

	/**
	 * A video link Tom can add to a week or a task (0.5.0).
	 *
	 * Only https links are kept, and only the ones the page can embed or open
	 * safely. YouTube and Vimeo are embedded (see ANPR_Frontend::video_embed);
	 * anything else https is shown as a plain link.
	 *
	 * @param mixed $raw Raw value.
	 * @return string
	 */
	public static function clean_video( $raw ) {
		$url = esc_url_raw( trim( (string) $raw ), array( 'https' ) );
		return $url ? mb_substr( $url, 0, 300 ) : '';
	}

	/**
	 * An id made of lowercase letters and digits, starting with the prefix.
	 *
	 * @param mixed  $id     Raw id.
	 * @param string $prefix Expected prefix.
	 * @return string '' when unusable.
	 */
	protected static function clean_id( $id, $prefix ) {
		$id = strtolower( preg_replace( '/[^A-Za-z0-9]/', '', (string) $id ) );
		if ( strlen( $id ) < 4 || strlen( $id ) > 32 || 0 !== strpos( $id, $prefix ) ) {
			return '';
		}
		return $id;
	}

	/**
	 * A Y-m-d date or ''.
	 *
	 * @param mixed $d Raw date.
	 * @return string
	 */
	protected static function clean_date( $d ) {
		$d = trim( (string) $d );
		if ( preg_match( '/^(\d{4})-(\d{2})-(\d{2})$/', $d, $m ) && checkdate( (int) $m[2], (int) $m[3], (int) $m[1] ) ) {
			return $d;
		}
		return '';
	}

	/**
	 * Today in the site's time zone, Y-m-d.
	 *
	 * @return string
	 */
	public static function today() {
		return wp_date( 'Y-m-d' );
	}

	/**
	 * Weeks this viewer may see, sorted by due date, with the current one marked.
	 *
	 * Singers see published weeks whose "show from" date has arrived.
	 * Managers also see drafts and weeks not yet shown (flagged, so the page
	 * doubles as the preview).
	 *
	 * @param int  $project_id Project ID.
	 * @param bool $is_manager Viewer is a manager.
	 * @return array { weeks: array[], current: string week id or '' }
	 */
	public static function visible( $project_id, $is_manager ) {
		$today = self::today();
		$weeks = array();
		foreach ( self::get( $project_id ) as $w ) {
			$published = 'published' === $w['status'];
			$shown     = '' === $w['show_from'] || $w['show_from'] <= $today;
			if ( ! $is_manager && ( ! $published || ! $shown ) ) {
				continue;
			}
			$w['staff_only'] = ! $published || ! $shown;
			$weeks[]         = $w;
		}
		$weeks = self::sort_by_due( $weeks );

		// Current = the first week, among those singers can see, that is not
		// yet past due. When every week is past, the last one stays current so
		// the page never opens on nothing.
		$current = '';
		$last    = '';
		foreach ( $weeks as $w ) {
			if ( $w['staff_only'] ) {
				continue;
			}
			$last = $w['id'];
			if ( '' === $current && ( '' === $w['due_date'] || $w['due_date'] >= $today ) ) {
				$current = $w['id'];
			}
		}
		if ( '' === $current ) {
			$current = $last;
		}
		if ( '' === $current && $weeks ) {
			// Staff preview with nothing published yet: open the first draft.
			$current = $weeks[0]['id'];
		}
		return array(
			'weeks'   => $weeks,
			'current' => $current,
		);
	}

	/**
	 * Sort weeks by due date; weeks with no date keep their order at the end.
	 *
	 * @param array[] $weeks Weeks.
	 * @return array[]
	 */
	public static function sort_by_due( $weeks ) {
		$i = 0;
		foreach ( $weeks as &$w ) {
			$w['_i'] = $i++;
		}
		unset( $w );
		usort(
			$weeks,
			static function ( $a, $b ) {
				$da = $a['due_date'];
				$db = $b['due_date'];
				if ( $da === $db ) {
					return $a['_i'] - $b['_i'];
				}
				if ( '' === $da ) {
					return 1;
				}
				if ( '' === $db ) {
					return -1;
				}
				return strcmp( $da, $db );
			}
		);
		foreach ( $weeks as &$w ) {
			unset( $w['_i'] );
		}
		unset( $w );
		return $weeks;
	}

	/**
	 * Find a week and task by id.
	 *
	 * @param int    $project_id Project ID.
	 * @param string $week_id    Week id.
	 * @param string $task_id    Task id ('' to find only the week).
	 * @return array|null { week, task }
	 */
	public static function find( $project_id, $week_id, $task_id = '' ) {
		foreach ( self::get( $project_id ) as $w ) {
			if ( $w['id'] !== $week_id ) {
				continue;
			}
			if ( '' === $task_id ) {
				return array( 'week' => $w, 'task' => null );
			}
			foreach ( $w['tasks'] as $t ) {
				if ( $t['id'] === $task_id ) {
					return array( 'week' => $w, 'task' => $t );
				}
			}
		}
		return null;
	}

	/**
	 * Is this task meant for this singer?
	 *
	 * A task with no voice parts is for everyone. A singer with no voice part
	 * on their profile sees every task rather than none — a missing profile
	 * field should not hide homework.
	 *
	 * @param array    $task        Task.
	 * @param string[] $user_parts  Viewer's voice parts.
	 * @return bool
	 */
	public static function task_is_for( $task, $user_parts ) {
		if ( empty( $task['parts'] ) || empty( $user_parts ) ) {
			return true;
		}
		return (bool) array_intersect( $task['parts'], $user_parts );
	}

	/**
	 * The projects shown on one ensemble tab, exactly as the Hub picks them:
	 * this season, this group (children included), published, not archived,
	 * and visible to the viewer.
	 *
	 * @param string $group_slug ans_group slug, '' for all.
	 * @param int    $user_id    Viewer.
	 * @return WP_Post[]
	 */
	public static function projects_for_group( $group_slug, $user_id ) {
		$season = ANSP_Taxonomies::get_current_season();
		$args   = array(
			'post_type'      => ANSP_CPT::POST_TYPE,
			'post_status'    => 'publish',
			'posts_per_page' => -1,
			'orderby'        => 'menu_order title',
			'order'          => 'ASC',
			'no_found_rows'  => true,
			'meta_query'     => array( // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query
				'relation' => 'OR',
				array(
					'key'     => 'ansp_project_status',
					'compare' => 'NOT EXISTS',
				),
				array(
					'key'     => 'ansp_project_status',
					'value'   => 'archived',
					'compare' => '!=',
				),
			),
		);
		$tax    = array();
		if ( $season instanceof WP_Term ) {
			$tax[] = array(
				'taxonomy' => 'ans_season',
				'field'    => 'term_id',
				'terms'    => (int) $season->term_id,
			);
		}
		if ( '' !== $group_slug && taxonomy_exists( 'ans_group' ) ) {
			$term = get_term_by( 'slug', $group_slug, 'ans_group' );
			if ( $term instanceof WP_Term ) {
				$tax[] = array(
					'taxonomy'         => 'ans_group',
					'field'            => 'term_id',
					'terms'            => (int) $term->term_id,
					'include_children' => true,
				);
			}
		}
		if ( $tax ) {
			$tax['relation']   = 'AND';
			$args['tax_query'] = $tax; // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_tax_query
		}
		$out = array();
		foreach ( get_posts( $args ) as $p ) {
			if ( ANSP_Permissions::user_can_see( $p, $user_id ) ) {
				$out[] = $p;
			}
		}
		return $out;
	}

	/**
	 * The viewer's material rows for a project, keyed by id.
	 *
	 * @param int $project_id Project ID.
	 * @param int $user_id    Viewer.
	 * @return array<string,array>
	 */
	public static function materials_by_id( $project_id, $user_id ) {
		static $cache = array();
		$key = $project_id . ':' . $user_id;
		if ( ! isset( $cache[ $key ] ) ) {
			$rows = array();
			foreach ( (array) ANSP_Permissions::get_visible_materials( (int) $project_id, (int) $user_id ) as $row ) {
				if ( is_array( $row ) && ! empty( $row['id'] ) ) {
					$rows[ sanitize_key( (string) $row['id'] ) ] = $row;
				}
			}
			$cache[ $key ] = $rows;
		}
		return $cache[ $key ];
	}

	/**
	 * Find the viewer's row for a task material, even if its id changed.
	 *
	 * WHY. The Hub lists a Drive score that has both a hand-entered row and a
	 * published mirror copy ONCE, keeping the hand row's words but taking the
	 * mirror row's id (ANSP_Scores_Source::append_published_scores). When the
	 * mirror library cannot be reached the hand row comes back with its own id.
	 * So the same score can appear under two ids depending on the day. Seen on
	 * staging 2026-09-16: a task attached to the hand id lost its score.
	 *
	 * Order: the stored id; then the same title, piece and type among the rows
	 * THIS VIEWER CAN SEE (so nothing is ever widened). The title/piece come from
	 * the snapshot saved with the task, or else from the project's raw hand row.
	 *
	 * @param array  $m          Task material.
	 * @param array  $rows       Viewer's rows by id (materials_by_id()).
	 * @param int    $project_id Project.
	 * @return array|null
	 */
	public static function resolve_material( $m, $rows, $project_id ) {
		if ( isset( $rows[ $m['id'] ] ) ) {
			return $rows[ $m['id'] ];
		}
		$title = isset( $m['title'] ) ? (string) $m['title'] : '';
		$piece = isset( $m['piece'] ) ? (string) $m['piece'] : '';
		$type  = isset( $m['type'] ) ? (string) $m['type'] : '';
		if ( '' === $title ) {
			foreach ( (array) ANSP_Materials::get_materials( (int) $project_id ) as $raw ) {
				if ( isset( $raw['id'] ) && sanitize_key( (string) $raw['id'] ) === $m['id'] ) {
					$title = isset( $raw['title'] ) ? (string) $raw['title'] : '';
					$piece = ANSP_Materials::get_piece( $raw );
					$type  = isset( $raw['type'] ) ? (string) $raw['type'] : '';
					break;
				}
			}
		}
		if ( '' === $title ) {
			return null;
		}
		$norm  = static function ( $v ) {
			return strtolower( trim( preg_replace( '/\s+/', ' ', (string) $v ) ) );
		};
		$found = null;
		foreach ( $rows as $row ) {
			if ( $norm( isset( $row['title'] ) ? $row['title'] : '' ) !== $norm( $title ) ) {
				continue;
			}
			if ( '' !== $piece && $norm( ANSP_Materials::get_piece( $row ) ) !== $norm( $piece ) ) {
				continue;
			}
			if ( '' !== $type && isset( $row['type'] ) && $row['type'] !== $type ) {
				continue;
			}
			if ( null !== $found ) {
				return null; // Ambiguous: never guess between two files.
			}
			$found = $row;
		}
		return $found;
	}

	/**
	 * Can a material row be played in the practice player?
	 *
	 * @param array $row Hub material row.
	 * @return bool
	 */
	public static function is_track( $row ) {
		return ANSP_Player::is_playable( $row );
	}
}
