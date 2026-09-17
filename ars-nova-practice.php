<?php
/**
 * Plugin Name:       Ars Nova Practice
 * Plugin URI:        https://github.com/ArsNovaSingers/ars-nova-practice
 * Description:       Weekly practice assignments for the Singers Hub: a builder for Tom and Zahnay, a week-by-week task page for singers with a multitrack practice player, done/rating/play tracking, and a progress report. Add-on for Ars Nova Singers Portal.
 * Version:           0.2.0
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Requires Plugins:  ars-nova-singers-portal
 * Author:            Ars Nova Singers
 * License:           GPLv2 or later
 * Text Domain:       ars-nova-practice
 *
 * @package ArsNovaPractice
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'ANPR_VERSION', '0.2.0' );
define( 'ANPR_FILE', __FILE__ );
define( 'ANPR_DIR', plugin_dir_path( __FILE__ ) );
define( 'ANPR_URL', plugin_dir_url( __FILE__ ) );

require_once ANPR_DIR . 'includes/class-anpr-schema.php';
require_once ANPR_DIR . 'includes/class-anpr-weeks.php';
require_once ANPR_DIR . 'includes/class-anpr-tracking.php';
require_once ANPR_DIR . 'includes/class-anpr-frontend.php';
require_once ANPR_DIR . 'includes/class-anpr-admin.php';

register_activation_hook( __FILE__, array( 'ANPR_Schema', 'install' ) );

/**
 * Start once every plugin has loaded, so the Hub's classes can be checked.
 *
 * The add-on reuses the Hub's permission engine, materials and audio endpoint
 * rather than keeping copies. Without the Hub it does nothing at all except
 * say so on the Plugins screen.
 */
function anpr_boot() {
	$needs = array( 'ANSP_Permissions', 'ANSP_Materials', 'ANSP_Player', 'ANSP_CPT', 'ANSP_Taxonomies' );
	foreach ( $needs as $class ) {
		if ( ! class_exists( $class ) ) {
			add_action(
				'admin_notices',
				static function () {
					if ( current_user_can( 'activate_plugins' ) ) {
						echo '<div class="notice notice-error"><p>' . esc_html__( 'Ars Nova Practice needs the Ars Nova Singers Portal plugin (version 1.40.0 or later) to be active.', 'ars-nova-practice' ) . '</p></div>';
					}
				}
			);
			return;
		}
	}
	ANPR_Schema::maybe_upgrade();
	ANPR_Tracking::init();
	ANPR_Frontend::init();
	if ( is_admin() ) {
		ANPR_Admin::init();
	}
}
add_action( 'plugins_loaded', 'anpr_boot', 20 );
