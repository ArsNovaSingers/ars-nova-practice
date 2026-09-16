<?php
/**
 * Uninstall: deliberately keeps everything.
 *
 * Singers' ticks, ratings and play history, and the weeks Tom and Zahnay built,
 * are not deleted when the plugin is removed. Removing a plugin to reinstall
 * it is common here, and data loss from a routine operation has happened on
 * this site before. Drop the tables by hand if they are truly unwanted:
 * {prefix}anpr_progress, {prefix}anpr_events, post meta _anpr_weeks,
 * options anpr_db_version and anpr_recording_test.
 *
 * @package ArsNovaPractice
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}
