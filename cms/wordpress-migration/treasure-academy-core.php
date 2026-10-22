<?php
/**
 * Plugin Name: Treasure Academy Public Content Core
 * Description: Staging-only starter for reviewed public content types and expiry controls. Never use for pupil records, results, payments, health data or safeguarding cases.
 * Version: 0.2.0
 * Requires at least: 6.6
 * Requires PHP: 8.1
 * Author: Treasure Academy
 * License: Proprietary
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

const TAA_PUBLIC_TYPES = array(
    'taa_class'    => array( 'Class Guides', 'Class Guide', 'dashicons-welcome-learn-more' ),
    'taa_update'   => array( 'Published Updates', 'Published Update', 'dashicons-megaphone' ),
    'taa_event'    => array( 'Confirmed Events', 'Confirmed Event', 'dashicons-calendar-alt' ),
    'taa_guidance' => array( 'Office Guidance', 'Office Guidance', 'dashicons-clipboard' ),
    'taa_staff'    => array( 'Staff Profiles', 'Staff Profile', 'dashicons-groups' ),
    'taa_policy'   => array( 'Policies', 'Policy', 'dashicons-shield' ),
);

function taa_governed_post_types() {
    return array_merge( array( 'page' ), array_keys( TAA_PUBLIC_TYPES ) );
}

/** Register public content types. No operational or child-record types belong here. */
function taa_register_public_content_types() {
    foreach ( TAA_PUBLIC_TYPES as $type => $labels ) {
        register_post_type(
            $type,
            array(
                'labels' => array(
                    'name'          => $labels[0],
                    'singular_name' => $labels[1],
                    'add_new_item'  => 'Add ' . $labels[1],
                    'edit_item'     => 'Edit ' . $labels[1],
                    'view_item'     => 'View ' . $labels[1],
                ),
                'public'             => true,
                'show_in_rest'       => true,
                'capability_type'    => array( 'taa_public_content', 'taa_public_contents' ),
                'has_archive'        => in_array( $type, array( 'taa_update', 'taa_event' ), true ),
                'rewrite'            => array( 'slug' => str_replace( 'taa_', '', $type ) ),
                'menu_icon'          => $labels[2],
                'supports'           => array( 'title', 'editor', 'excerpt', 'thumbnail', 'revisions', 'custom-fields' ),
                'delete_with_user'   => false,
                'map_meta_cap'       => true,
                'show_in_nav_menus'  => true,
                'exclude_from_search'=> false,
            )
        );
    }
}
add_action( 'init', 'taa_register_public_content_types' );

/** Authorise metadata changes against the specific content item, not a broad role name. */
function taa_can_edit_workflow_meta( $allowed, $meta_key, $post_id, $user_id ) {
    return $post_id && user_can( $user_id, 'edit_post', $post_id );
}

/** Register workflow metadata. Source and approval notes stay out of public REST responses. */
function taa_register_workflow_meta() {
    $public_date = array(
        'type'              => 'string',
        'single'            => true,
        'show_in_rest'      => true,
        'sanitize_callback' => 'sanitize_text_field',
        'auth_callback'     => 'taa_can_edit_workflow_meta',
    );
    $private_text = array(
        'type'              => 'string',
        'single'            => true,
        'show_in_rest'      => false,
        'sanitize_callback' => 'sanitize_text_field',
        'auth_callback'     => 'taa_can_edit_workflow_meta',
    );

    foreach ( taa_governed_post_types() as $type ) {
        register_post_meta( $type, 'taa_last_reviewed', $public_date );
        register_post_meta( $type, 'taa_next_review', $public_date );
        register_post_meta( $type, 'taa_expires_at', $public_date );
        register_post_meta( $type, 'taa_content_owner', $private_text );
        register_post_meta( $type, 'taa_source_reference', $private_text );
        register_post_meta( $type, 'taa_approval_status', $private_text );
    }
}
add_action( 'init', 'taa_register_workflow_meta' );

/** Prevent publication when required provenance/review fields are absent. */
function taa_fail_closed_publication( $data, $postarr ) {
    $type = isset( $data['post_type'] ) ? $data['post_type'] : '';
    if ( 'publish' !== $data['post_status'] || ! in_array( $type, taa_governed_post_types(), true ) ) {
        return $data;
    }

    $post_id = isset( $postarr['ID'] ) ? absint( $postarr['ID'] ) : 0;
    $required = array(
        'taa_last_reviewed'    => $post_id ? get_post_meta( $post_id, 'taa_last_reviewed', true ) : '',
        'taa_content_owner'    => $post_id ? get_post_meta( $post_id, 'taa_content_owner', true ) : '',
        'taa_source_reference' => $post_id ? get_post_meta( $post_id, 'taa_source_reference', true ) : '',
        'taa_approval_status'  => $post_id ? get_post_meta( $post_id, 'taa_approval_status', true ) : '',
    );
    $last_reviewed_ok = preg_match( '/^\d{4}-\d{2}-\d{2}$/', $required['taa_last_reviewed'] )
        && $required['taa_last_reviewed'] <= current_time( 'Y-m-d' );
    $expiry_ok = true;
    if ( in_array( $type, array( 'taa_update', 'taa_event', 'taa_guidance' ), true ) ) {
        $expires_at = $post_id ? get_post_meta( $post_id, 'taa_expires_at', true ) : '';
        $expiry_ok = preg_match( '/^\d{4}-\d{2}-\d{2}$/', $expires_at )
            && $expires_at > current_time( 'Y-m-d' );
    }

    if ( in_array( '', $required, true ) || ! $last_reviewed_ok || ! $expiry_ok || 'owner_approved' !== $required['taa_approval_status'] ) {
        $data['post_status'] = 'draft';
        set_transient( 'taa_publish_blocked_' . get_current_user_id(), 1, 60 );
    }
    return $data;
}
add_filter( 'wp_insert_post_data', 'taa_fail_closed_publication', 20, 2 );

function taa_publication_notice() {
    if ( get_transient( 'taa_publish_blocked_' . get_current_user_id() ) ) {
        delete_transient( 'taa_publish_blocked_' . get_current_user_id() );
        echo '<div class="notice notice-error"><p><strong>Publication blocked:</strong> add a valid content owner, source reference and review date; operational content also needs a future expiry date. Then record owner_approved status.</p></div>';
    }
}
add_action( 'admin_notices', 'taa_publication_notice' );

/** Archive expired operational content once daily. */
function taa_archive_expired_content() {
    $query = new WP_Query(
        array(
            'post_type'      => array( 'taa_update', 'taa_event', 'taa_guidance' ),
            'post_status'    => 'publish',
            'posts_per_page' => 100,
            'fields'         => 'ids',
            'meta_query'     => array(
                array(
                    'key'     => 'taa_expires_at',
                    'value'   => current_time( 'Y-m-d' ),
                    'compare' => '<=',
                    'type'    => 'DATE',
                ),
            ),
        )
    );
    foreach ( $query->posts as $post_id ) {
        wp_update_post( array( 'ID' => $post_id, 'post_status' => 'draft' ) );
        update_post_meta( $post_id, 'taa_approval_status', 'archived' );
    }
}
add_action( 'taa_daily_expiry_check', 'taa_archive_expired_content' );

function taa_reviewer_capabilities() {
    return array(
        'read',
        'edit_taa_public_contents',
        'edit_others_taa_public_contents',
        'read_private_taa_public_contents',
    );
}

function taa_manager_capabilities() {
    return array_merge(
        taa_reviewer_capabilities(),
        array(
            'publish_taa_public_contents',
            'edit_private_taa_public_contents',
            'edit_published_taa_public_contents',
            'delete_taa_public_contents',
            'delete_private_taa_public_contents',
            'delete_published_taa_public_contents',
            'delete_others_taa_public_contents',
        )
    );
}

function taa_activate_public_content_core() {
    taa_register_public_content_types();
    flush_rewrite_rules();
    if ( ! wp_next_scheduled( 'taa_daily_expiry_check' ) ) {
        wp_schedule_event( time() + HOUR_IN_SECONDS, 'daily', 'taa_daily_expiry_check' );
    }

    $reviewer = get_role( 'taa_reviewer' );
    if ( ! $reviewer ) {
        add_role( 'taa_reviewer', 'School Content Reviewer', array( 'read' => true ) );
        $reviewer = get_role( 'taa_reviewer' );
    }
    if ( $reviewer ) {
        foreach ( array( 'edit_posts', 'edit_others_posts', 'publish_posts', 'read_private_posts', 'upload_files' ) as $legacy_capability ) {
            $reviewer->remove_cap( $legacy_capability );
        }
        foreach ( taa_reviewer_capabilities() as $capability ) {
            $reviewer->add_cap( $capability );
        }
    }

    foreach ( array( 'administrator', 'editor' ) as $role_name ) {
        $role = get_role( $role_name );
        if ( ! $role ) {
            continue;
        }
        foreach ( taa_manager_capabilities() as $capability ) {
            $role->add_cap( $capability );
        }
    }
}
register_activation_hook( __FILE__, 'taa_activate_public_content_core' );

function taa_deactivate_public_content_core() {
    $timestamp = wp_next_scheduled( 'taa_daily_expiry_check' );
    if ( $timestamp ) {
        wp_unschedule_event( $timestamp, 'taa_daily_expiry_check' );
    }
    flush_rewrite_rules();
}
register_deactivation_hook( __FILE__, 'taa_deactivate_public_content_core' );
