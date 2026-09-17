<?php
/**
 * Database tables for practice tracking.
 *
 * The weeks and tasks themselves are NOT here — they live in post meta on the
 * project (see ANPR_Weeks), the same way the Hub keeps its materials. Only the
 * things that grow with every singer and every click get tables:
 *
 *  - anpr_progress: one row per singer per task — done, and the latest rating.
 *  - anpr_events:   an append-only log — page views, score opens, plays,
 *                   listening time, done/undone, every rating change, and
 *                   saved-take activity (take / takeplay / takedel).
 *  - anpr_takes:    saved practice takes (0.4.0). The audio itself is in the
 *                   private Google Cloud bucket; this row says whose it is.
 *
 * @package ArsNovaPractice
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Table names and install/upgrade.
 */
class ANPR_Schema {

	const DB_VERSION = '2'; // 2: anpr_takes (0.4.0).
	const OPTION     = 'anpr_db_version';

	/**
	 * Progress table name.
	 *
	 * @return string
	 */
	public static function progress_table() {
		global $wpdb;
		return $wpdb->prefix . 'anpr_progress';
	}

	/**
	 * Events table name.
	 *
	 * @return string
	 */
	public static function events_table() {
		global $wpdb;
		return $wpdb->prefix . 'anpr_events';
	}

	/**
	 * Create or update the tables.
	 */
	public static function install() {
		global $wpdb;
		require_once ABSPATH . 'wp-admin/includes/upgrade.php';
		$charset  = $wpdb->get_charset_collate();
		$progress = self::progress_table();
		$events   = self::events_table();

		dbDelta(
			"CREATE TABLE {$progress} (
			user_id bigint(20) unsigned NOT NULL,
			task_id varchar(32) NOT NULL,
			project_id bigint(20) unsigned NOT NULL,
			week_id varchar(32) NOT NULL,
			done tinyint(1) NOT NULL DEFAULT 0,
			done_at datetime NULL DEFAULT NULL,
			rating tinyint(4) NULL DEFAULT NULL,
			rated_at datetime NULL DEFAULT NULL,
			updated_at datetime NOT NULL,
			PRIMARY KEY  (user_id,task_id),
			KEY project_week (project_id,week_id)
			) {$charset};"
		);

		dbDelta(
			"CREATE TABLE {$events} (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			user_id bigint(20) unsigned NOT NULL,
			project_id bigint(20) unsigned NOT NULL,
			week_id varchar(32) NOT NULL DEFAULT '',
			task_id varchar(32) NOT NULL DEFAULT '',
			material_id varchar(64) NOT NULL DEFAULT '',
			event varchar(16) NOT NULL,
			seconds int(10) unsigned NOT NULL DEFAULT 0,
			value int(11) NULL DEFAULT NULL,
			created_at datetime NOT NULL,
			PRIMARY KEY  (id),
			KEY user_task (user_id,task_id),
			KEY project_week (project_id,week_id),
			KEY created_at (created_at)
			) {$charset};"
		);

		$takes = ANPR_Takes::table();
		dbDelta(
			"CREATE TABLE {$takes} (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			uuid varchar(40) NOT NULL,
			user_id bigint(20) unsigned NOT NULL,
			project_id bigint(20) unsigned NOT NULL,
			week_id varchar(32) NOT NULL DEFAULT '',
			task_id varchar(32) NOT NULL DEFAULT '',
			material_id varchar(64) NOT NULL DEFAULT '',
			piece_key varchar(64) NOT NULL,
			track_title varchar(191) NOT NULL DEFAULT '',
			name varchar(100) NOT NULL DEFAULT '',
			object_path varchar(191) NOT NULL,
			format varchar(8) NOT NULL DEFAULT 'mp3',
			bytes bigint(20) unsigned NOT NULL DEFAULT 0,
			seconds int(10) unsigned NOT NULL DEFAULT 0,
			status varchar(12) NOT NULL DEFAULT 'pending',
			created_at datetime NOT NULL,
			updated_at datetime NOT NULL,
			PRIMARY KEY  (id),
			UNIQUE KEY uuid (uuid),
			KEY user_piece (user_id,project_id,piece_key),
			KEY project_id (project_id)
			) {$charset};"
		);

		update_option( self::OPTION, self::DB_VERSION, false );
	}

	/**
	 * Run install() when the stored schema version is behind.
	 *
	 * A plugin installed by replacing its folder (which is how our releases are
	 * installed) never fires the activation hook, so the check also runs on load.
	 */
	public static function maybe_upgrade() {
		if ( get_option( self::OPTION ) !== self::DB_VERSION ) {
			self::install();
		}
	}
}
