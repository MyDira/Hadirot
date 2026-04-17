export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.12 (cd3cf9e)"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      admin_settings: {
        Row: {
          featured_duration_days: number | null
          id: string
          listing_active_days: number | null
          max_featured_boost_positions: number | null
          max_featured_listings: number | null
          max_featured_per_user: number | null
          max_featured_sales: number | null
          rental_active_days: number | null
          sale_active_days: number | null
          sales_feature_enabled: boolean | null
          sales_universal_access: boolean | null
          updated_at: string | null
        }
        Insert: {
          featured_duration_days?: number | null
          id?: string
          listing_active_days?: number | null
          max_featured_boost_positions?: number | null
          max_featured_listings?: number | null
          max_featured_per_user?: number | null
          max_featured_sales?: number | null
          rental_active_days?: number | null
          sale_active_days?: number | null
          sales_feature_enabled?: boolean | null
          sales_universal_access?: boolean | null
          updated_at?: string | null
        }
        Update: {
          featured_duration_days?: number | null
          id?: string
          listing_active_days?: number | null
          max_featured_boost_positions?: number | null
          max_featured_listings?: number | null
          max_featured_per_user?: number | null
          max_featured_sales?: number | null
          rental_active_days?: number | null
          sale_active_days?: number | null
          sales_feature_enabled?: boolean | null
          sales_universal_access?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
      agencies: {
        Row: {
          about_html: string | null
          banner_url: string | null
          created_at: string
          email: string | null
          has_active_subscription: boolean | null
          has_paid_profile_page: boolean | null
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          owner_profile_id: string | null
          phone: string | null
          slug: string
          stripe_customer_id: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          about_html?: string | null
          banner_url?: string | null
          created_at?: string
          email?: string | null
          has_active_subscription?: boolean | null
          has_paid_profile_page?: boolean | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          owner_profile_id?: string | null
          phone?: string | null
          slug: string
          stripe_customer_id?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          about_html?: string | null
          banner_url?: string | null
          created_at?: string
          email?: string | null
          has_active_subscription?: boolean | null
          has_paid_profile_page?: boolean | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          owner_profile_id?: string | null
          phone?: string | null
          slug?: string
          stripe_customer_id?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agencies_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agencies_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_events: {
        Row: {
          anon_id: string
          event_name: string
          event_props: Json
          id: string
          ip: string | null
          ip_hash: string | null
          occurred_at: string
          page: string | null
          props: Json
          received_at: string | null
          referrer: string | null
          session_id: string
          ts: string
          ua: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          anon_id: string
          event_name: string
          event_props?: Json
          id?: string
          ip?: string | null
          ip_hash?: string | null
          occurred_at: string
          page?: string | null
          props?: Json
          received_at?: string | null
          referrer?: string | null
          session_id: string
          ts?: string
          ua?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          anon_id?: string
          event_name?: string
          event_props?: Json
          id?: string
          ip?: string | null
          ip_hash?: string | null
          occurred_at?: string
          page?: string | null
          props?: Json
          received_at?: string | null
          referrer?: string | null
          session_id?: string
          ts?: string
          ua?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_sessions: {
        Row: {
          anon_id: string
          duration_seconds: number | null
          ended_at: string | null
          last_seen_at: string
          session_id: string
          started_at: string
          user_id: string | null
        }
        Insert: {
          anon_id: string
          duration_seconds?: number | null
          ended_at?: string | null
          last_seen_at: string
          session_id: string
          started_at: string
          user_id?: string | null
        }
        Update: {
          anon_id?: string
          duration_seconds?: number | null
          ended_at?: string | null
          last_seen_at?: string
          session_id?: string
          started_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      banner_buttons: {
        Row: {
          banner_id: string
          button_style: string | null
          button_text: string
          button_url: string
          created_at: string | null
          display_order: number | null
          icon_name: string | null
          id: string
        }
        Insert: {
          banner_id: string
          button_style?: string | null
          button_text: string
          button_url: string
          created_at?: string | null
          display_order?: number | null
          icon_name?: string | null
          id?: string
        }
        Update: {
          banner_id?: string
          button_style?: string | null
          button_text?: string
          button_url?: string
          created_at?: string | null
          display_order?: number | null
          icon_name?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "banner_buttons_banner_id_fkey"
            columns: ["banner_id"]
            isOneToOne: false
            referencedRelation: "hero_banners"
            referencedColumns: ["id"]
          },
        ]
      }
      commercial_favorites: {
        Row: {
          created_at: string | null
          id: string
          listing_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          listing_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          listing_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commercial_favorites_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "commercial_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      commercial_listing_images: {
        Row: {
          created_at: string
          id: string
          image_url: string
          is_featured: boolean
          listing_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          image_url: string
          is_featured?: boolean
          listing_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string
          is_featured?: boolean
          listing_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "commercial_listing_images_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "commercial_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      commercial_listings: {
        Row: {
          ada_accessible: boolean | null
          admin_custom_agency_name: string | null
          admin_listing_type_display: string | null
          agency_id: string | null
          approved: boolean
          asking_price: number | null
          available_date: string | null
          available_sf: number | null
          build_out_condition: string | null
          building_class: string | null
          call_for_price: boolean
          cam_per_sf: number | null
          cap_rate: number | null
          capacity_max: number | null
          capacity_min: number | null
          ceiling_height_ft: number | null
          clear_height_ft: number | null
          column_spacing: string | null
          commercial_space_type: string
          commercial_subtype: string | null
          conference_rooms: number | null
          construction_type: string | null
          contact_name: string
          contact_phone: string
          contact_phone_e164: string | null
          corner_location: boolean | null
          crane_capacity: string | null
          created_at: string
          cross_street_a: string | null
          cross_street_b: string | null
          current_lease_expiration: string | null
          current_lease_rent: number | null
          current_lease_tenant: string | null
          current_rental_income: number | null
          deactivated_at: string | null
          description: string | null
          direct_views: number
          drive_in_doors: number | null
          electrical_amps: number | null
          electrical_voltage: string | null
          elevator_count: number | null
          escalation: string | null
          exam_rooms: number | null
          expense_stop_per_sf: number | null
          expires_at: string | null
          featured_expires_at: string | null
          featured_plan: string | null
          featured_started_at: string | null
          floor_level: string | null
          floor_load_capacity: string | null
          foot_traffic_vpd: number | null
          freight_elevator_count: number | null
          frontage_ft: number | null
          full_address: string | null
          gas_line: boolean | null
          grease_trap: boolean | null
          hvac_type: string | null
          id: string
          impressions: number
          is_active: boolean
          is_commercial: boolean
          is_featured: boolean
          kitchen_exhaust: boolean | null
          last_deactivation_email_sent_at: string | null
          last_published_at: string | null
          latitude: number | null
          layout_type: string | null
          lease_term_text: string | null
          lease_type: string | null
          liquor_license_transferable: boolean | null
          listing_type: string
          loading_docks: number | null
          longitude: number | null
          moisture_waterproofing: boolean | null
          natural_light: boolean | null
          neighborhood: string | null
          noi: number | null
          number_of_floors: number | null
          occupancy_limit: number | null
          office_warehouse_ratio: string | null
          outdoor_space: string | null
          parking_ratio: string | null
          parking_spaces: number | null
          parking_type: string | null
          permitted_uses_commercial: string | null
          plumbing_wet_columns: boolean | null
          previous_use: string | null
          price: number | null
          price_per_sf_year: number | null
          private_entrance: boolean | null
          private_offices: number | null
          property_taxes_annual: number | null
          rail_access: boolean | null
          renewal_options: string | null
          seating_capacity: number | null
          security_deposit: string | null
          separate_entrance: boolean | null
          signage_rights: boolean | null
          sprinkler_type: string | null
          sublease: boolean | null
          tenancy_type: string | null
          three_phase_power: boolean | null
          ti_allowance_per_sf: number | null
          title: string | null
          total_building_sf: number | null
          truck_court_depth: string | null
          unit_count: number | null
          updated_at: string
          use_breakdown: string | null
          use_restrictions: string | null
          user_id: string | null
          ventilation: boolean | null
          video_thumbnail_url: string | null
          video_url: string | null
          views: number
          waiting_room: boolean | null
          year_built: number | null
          year_renovated: number | null
          zoning_code: string | null
        }
        Insert: {
          ada_accessible?: boolean | null
          admin_custom_agency_name?: string | null
          admin_listing_type_display?: string | null
          agency_id?: string | null
          approved?: boolean
          asking_price?: number | null
          available_date?: string | null
          available_sf?: number | null
          build_out_condition?: string | null
          building_class?: string | null
          call_for_price?: boolean
          cam_per_sf?: number | null
          cap_rate?: number | null
          capacity_max?: number | null
          capacity_min?: number | null
          ceiling_height_ft?: number | null
          clear_height_ft?: number | null
          column_spacing?: string | null
          commercial_space_type?: string
          commercial_subtype?: string | null
          conference_rooms?: number | null
          construction_type?: string | null
          contact_name?: string
          contact_phone?: string
          contact_phone_e164?: string | null
          corner_location?: boolean | null
          crane_capacity?: string | null
          created_at?: string
          cross_street_a?: string | null
          cross_street_b?: string | null
          current_lease_expiration?: string | null
          current_lease_rent?: number | null
          current_lease_tenant?: string | null
          current_rental_income?: number | null
          deactivated_at?: string | null
          description?: string | null
          direct_views?: number
          drive_in_doors?: number | null
          electrical_amps?: number | null
          electrical_voltage?: string | null
          elevator_count?: number | null
          escalation?: string | null
          exam_rooms?: number | null
          expense_stop_per_sf?: number | null
          expires_at?: string | null
          featured_expires_at?: string | null
          featured_plan?: string | null
          featured_started_at?: string | null
          floor_level?: string | null
          floor_load_capacity?: string | null
          foot_traffic_vpd?: number | null
          freight_elevator_count?: number | null
          frontage_ft?: number | null
          full_address?: string | null
          gas_line?: boolean | null
          grease_trap?: boolean | null
          hvac_type?: string | null
          id?: string
          impressions?: number
          is_active?: boolean
          is_commercial?: boolean
          is_featured?: boolean
          kitchen_exhaust?: boolean | null
          last_deactivation_email_sent_at?: string | null
          last_published_at?: string | null
          latitude?: number | null
          layout_type?: string | null
          lease_term_text?: string | null
          lease_type?: string | null
          liquor_license_transferable?: boolean | null
          listing_type?: string
          loading_docks?: number | null
          longitude?: number | null
          moisture_waterproofing?: boolean | null
          natural_light?: boolean | null
          neighborhood?: string | null
          noi?: number | null
          number_of_floors?: number | null
          occupancy_limit?: number | null
          office_warehouse_ratio?: string | null
          outdoor_space?: string | null
          parking_ratio?: string | null
          parking_spaces?: number | null
          parking_type?: string | null
          permitted_uses_commercial?: string | null
          plumbing_wet_columns?: boolean | null
          previous_use?: string | null
          price?: number | null
          price_per_sf_year?: number | null
          private_entrance?: boolean | null
          private_offices?: number | null
          property_taxes_annual?: number | null
          rail_access?: boolean | null
          renewal_options?: string | null
          seating_capacity?: number | null
          security_deposit?: string | null
          separate_entrance?: boolean | null
          signage_rights?: boolean | null
          sprinkler_type?: string | null
          sublease?: boolean | null
          tenancy_type?: string | null
          three_phase_power?: boolean | null
          ti_allowance_per_sf?: number | null
          title?: string | null
          total_building_sf?: number | null
          truck_court_depth?: string | null
          unit_count?: number | null
          updated_at?: string
          use_breakdown?: string | null
          use_restrictions?: string | null
          user_id?: string | null
          ventilation?: boolean | null
          video_thumbnail_url?: string | null
          video_url?: string | null
          views?: number
          waiting_room?: boolean | null
          year_built?: number | null
          year_renovated?: number | null
          zoning_code?: string | null
        }
        Update: {
          ada_accessible?: boolean | null
          admin_custom_agency_name?: string | null
          admin_listing_type_display?: string | null
          agency_id?: string | null
          approved?: boolean
          asking_price?: number | null
          available_date?: string | null
          available_sf?: number | null
          build_out_condition?: string | null
          building_class?: string | null
          call_for_price?: boolean
          cam_per_sf?: number | null
          cap_rate?: number | null
          capacity_max?: number | null
          capacity_min?: number | null
          ceiling_height_ft?: number | null
          clear_height_ft?: number | null
          column_spacing?: string | null
          commercial_space_type?: string
          commercial_subtype?: string | null
          conference_rooms?: number | null
          construction_type?: string | null
          contact_name?: string
          contact_phone?: string
          contact_phone_e164?: string | null
          corner_location?: boolean | null
          crane_capacity?: string | null
          created_at?: string
          cross_street_a?: string | null
          cross_street_b?: string | null
          current_lease_expiration?: string | null
          current_lease_rent?: number | null
          current_lease_tenant?: string | null
          current_rental_income?: number | null
          deactivated_at?: string | null
          description?: string | null
          direct_views?: number
          drive_in_doors?: number | null
          electrical_amps?: number | null
          electrical_voltage?: string | null
          elevator_count?: number | null
          escalation?: string | null
          exam_rooms?: number | null
          expense_stop_per_sf?: number | null
          expires_at?: string | null
          featured_expires_at?: string | null
          featured_plan?: string | null
          featured_started_at?: string | null
          floor_level?: string | null
          floor_load_capacity?: string | null
          foot_traffic_vpd?: number | null
          freight_elevator_count?: number | null
          frontage_ft?: number | null
          full_address?: string | null
          gas_line?: boolean | null
          grease_trap?: boolean | null
          hvac_type?: string | null
          id?: string
          impressions?: number
          is_active?: boolean
          is_commercial?: boolean
          is_featured?: boolean
          kitchen_exhaust?: boolean | null
          last_deactivation_email_sent_at?: string | null
          last_published_at?: string | null
          latitude?: number | null
          layout_type?: string | null
          lease_term_text?: string | null
          lease_type?: string | null
          liquor_license_transferable?: boolean | null
          listing_type?: string
          loading_docks?: number | null
          longitude?: number | null
          moisture_waterproofing?: boolean | null
          natural_light?: boolean | null
          neighborhood?: string | null
          noi?: number | null
          number_of_floors?: number | null
          occupancy_limit?: number | null
          office_warehouse_ratio?: string | null
          outdoor_space?: string | null
          parking_ratio?: string | null
          parking_spaces?: number | null
          parking_type?: string | null
          permitted_uses_commercial?: string | null
          plumbing_wet_columns?: boolean | null
          previous_use?: string | null
          price?: number | null
          price_per_sf_year?: number | null
          private_entrance?: boolean | null
          private_offices?: number | null
          property_taxes_annual?: number | null
          rail_access?: boolean | null
          renewal_options?: string | null
          seating_capacity?: number | null
          security_deposit?: string | null
          separate_entrance?: boolean | null
          signage_rights?: boolean | null
          sprinkler_type?: string | null
          sublease?: boolean | null
          tenancy_type?: string | null
          three_phase_power?: boolean | null
          ti_allowance_per_sf?: number | null
          title?: string | null
          total_building_sf?: number | null
          truck_court_depth?: string | null
          unit_count?: number | null
          updated_at?: string
          use_breakdown?: string | null
          use_restrictions?: string | null
          user_id?: string | null
          ventilation?: boolean | null
          video_thumbnail_url?: string | null
          video_url?: string | null
          views?: number
          waiting_room?: boolean | null
          year_built?: number | null
          year_renovated?: number | null
          zoning_code?: string | null
        }
        Relationships: []
      }
      concierge_submissions: {
        Row: {
          admin_notes: string | null
          amount_cents: number
          blurb: string
          created_at: string
          id: string
          listing_id: string | null
          status: string
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          amount_cents?: number
          blurb: string
          created_at?: string
          id?: string
          listing_id?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          amount_cents?: number
          blurb?: string
          created_at?: string
          id?: string
          listing_id?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "concierge_submissions_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listing_metrics_v1"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "concierge_submissions_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concierge_submissions_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "concierge_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concierge_submissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concierge_submissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      concierge_subscriptions: {
        Row: {
          admin_notes: string | null
          cancelled_at: string | null
          created_at: string
          current_period_end: string | null
          email_handle: string | null
          id: string
          last_checked_at: string | null
          sources: Json | null
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          tier: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          cancelled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          email_handle?: string | null
          id?: string
          last_checked_at?: string | null
          sources?: Json | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tier: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          cancelled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          email_handle?: string | null
          id?: string
          last_checked_at?: string | null
          sources?: Json | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tier?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "concierge_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concierge_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_admin_digest_config: {
        Row: {
          created_at: string | null
          delivery_time: string
          enabled: boolean
          id: string
          timezone: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          delivery_time?: string
          enabled?: boolean
          id?: string
          timezone?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          delivery_time?: string
          enabled?: boolean
          id?: string
          timezone?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      daily_admin_digest_logs: {
        Row: {
          created_at: string | null
          error_message: string | null
          id: string
          listings_count: number
          recipients_count: number
          run_at: string
          success: boolean
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          listings_count?: number
          recipients_count?: number
          run_at?: string
          success?: boolean
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          listings_count?: number
          recipients_count?: number
          run_at?: string
          success?: boolean
        }
        Relationships: []
      }
      daily_admin_digest_sent_listings: {
        Row: {
          created_at: string | null
          id: string
          listing_id: string
          sent_at: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          listing_id: string
          sent_at?: string
        }
        Update: {
          created_at?: string | null
          id?: string
          listing_id?: string
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_admin_digest_sent_listings_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listing_metrics_v1"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "daily_admin_digest_sent_listings_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_analytics: {
        Row: {
          avg_session_minutes: number | null
          created_at: string | null
          date: string
          dau: number | null
          listing_views: number | null
          post_abandoned: number | null
          post_starts: number | null
          post_submits: number | null
          post_success: number | null
          returners: number | null
          visitors: number | null
        }
        Insert: {
          avg_session_minutes?: number | null
          created_at?: string | null
          date: string
          dau?: number | null
          listing_views?: number | null
          post_abandoned?: number | null
          post_starts?: number | null
          post_submits?: number | null
          post_success?: number | null
          returners?: number | null
          visitors?: number | null
        }
        Update: {
          avg_session_minutes?: number | null
          created_at?: string | null
          date?: string
          dau?: number | null
          listing_views?: number | null
          post_abandoned?: number | null
          post_starts?: number | null
          post_submits?: number | null
          post_success?: number | null
          returners?: number | null
          visitors?: number | null
        }
        Relationships: []
      }
      daily_top_filters: {
        Row: {
          created_at: string | null
          date: string
          filter_key: string
          filter_value: string
          rank: number
          uses: number | null
        }
        Insert: {
          created_at?: string | null
          date: string
          filter_key: string
          filter_value: string
          rank: number
          uses?: number | null
        }
        Update: {
          created_at?: string | null
          date?: string
          filter_key?: string
          filter_value?: string
          rank?: number
          uses?: number | null
        }
        Relationships: []
      }
      daily_top_listings: {
        Row: {
          created_at: string | null
          ctr: number | null
          date: string
          impressions: number | null
          listing_id: string
          rank: number
          views: number | null
        }
        Insert: {
          created_at?: string | null
          ctr?: number | null
          date: string
          impressions?: number | null
          listing_id: string
          rank: number
          views?: number | null
        }
        Update: {
          created_at?: string | null
          ctr?: number | null
          date?: string
          impressions?: number | null
          listing_id?: string
          rank?: number
          views?: number | null
        }
        Relationships: []
      }
      digest_global_settings: {
        Row: {
          created_at: string | null
          default_footer_text: string
          default_header_text: string
          id: string
          updated_at: string | null
          updated_by: string | null
          whatsapp_character_limit: number
        }
        Insert: {
          created_at?: string | null
          default_footer_text?: string
          default_header_text?: string
          id?: string
          updated_at?: string | null
          updated_by?: string | null
          whatsapp_character_limit?: number
        }
        Update: {
          created_at?: string | null
          default_footer_text?: string
          default_header_text?: string
          id?: string
          updated_at?: string | null
          updated_by?: string | null
          whatsapp_character_limit?: number
        }
        Relationships: [
          {
            foreignKeyName: "digest_global_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "digest_global_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      digest_sends: {
        Row: {
          config_snapshot: Json | null
          created_at: string | null
          error_message: string | null
          execution_time_ms: number | null
          filter_links_included: Json | null
          id: string
          listings_by_category: Json | null
          recipient_count: number
          recipient_emails: string[]
          sent_at: string
          sent_by: string | null
          success: boolean
          template_id: string | null
          template_name: string
          template_type: Database["public"]["Enums"]["digest_template_type"]
          total_listings_sent: number
        }
        Insert: {
          config_snapshot?: Json | null
          created_at?: string | null
          error_message?: string | null
          execution_time_ms?: number | null
          filter_links_included?: Json | null
          id?: string
          listings_by_category?: Json | null
          recipient_count: number
          recipient_emails: string[]
          sent_at?: string
          sent_by?: string | null
          success?: boolean
          template_id?: string | null
          template_name: string
          template_type: Database["public"]["Enums"]["digest_template_type"]
          total_listings_sent?: number
        }
        Update: {
          config_snapshot?: Json | null
          created_at?: string | null
          error_message?: string | null
          execution_time_ms?: number | null
          filter_links_included?: Json | null
          id?: string
          listings_by_category?: Json | null
          recipient_count?: number
          recipient_emails?: string[]
          sent_at?: string
          sent_by?: string | null
          success?: boolean
          template_id?: string | null
          template_name?: string
          template_type?: Database["public"]["Enums"]["digest_template_type"]
          total_listings_sent?: number
        }
        Relationships: [
          {
            foreignKeyName: "digest_sends_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "digest_sends_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "digest_sends_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "digest_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      digest_sent_listings: {
        Row: {
          category_label: string | null
          created_at: string | null
          digest_send_id: string
          id: string
          listing_bedrooms: number | null
          listing_id: string
          listing_price: number | null
          sent_at: string
          template_id: string | null
        }
        Insert: {
          category_label?: string | null
          created_at?: string | null
          digest_send_id: string
          id?: string
          listing_bedrooms?: number | null
          listing_id: string
          listing_price?: number | null
          sent_at?: string
          template_id?: string | null
        }
        Update: {
          category_label?: string | null
          created_at?: string | null
          digest_send_id?: string
          id?: string
          listing_bedrooms?: number | null
          listing_id?: string
          listing_price?: number | null
          sent_at?: string
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "digest_sent_listings_digest_send_id_fkey"
            columns: ["digest_send_id"]
            isOneToOne: false
            referencedRelation: "digest_sends"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "digest_sent_listings_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listing_metrics_v1"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "digest_sent_listings_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "digest_sent_listings_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "digest_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      digest_templates: {
        Row: {
          allow_resend: boolean | null
          category:
            | Database["public"]["Enums"]["digest_template_category"]
            | null
          category_limits: Json | null
          collection_configs: Json | null
          created_at: string | null
          created_by: string | null
          custom_footer_override: string | null
          custom_header_override: string | null
          description: string | null
          filter_config: Json | null
          filter_preset_ids: string[] | null
          id: string
          ignore_send_history: boolean | null
          include_collections: boolean | null
          include_filter_links: boolean | null
          is_default: boolean | null
          last_used_at: string | null
          listings_filter_config: Json | null
          listings_time_filter: string | null
          name: string
          output_format: string | null
          resend_after_days: number | null
          section_by_filter: string | null
          sort_preference:
            | Database["public"]["Enums"]["digest_sort_option"]
            | null
          subject_template: string | null
          template_type: Database["public"]["Enums"]["digest_template_type"]
          updated_at: string | null
          usage_count: number | null
          use_global_footer: boolean | null
          use_global_header: boolean | null
          whatsapp_intro_text: string | null
          whatsapp_outro_text: string | null
        }
        Insert: {
          allow_resend?: boolean | null
          category?:
            | Database["public"]["Enums"]["digest_template_category"]
            | null
          category_limits?: Json | null
          collection_configs?: Json | null
          created_at?: string | null
          created_by?: string | null
          custom_footer_override?: string | null
          custom_header_override?: string | null
          description?: string | null
          filter_config?: Json | null
          filter_preset_ids?: string[] | null
          id?: string
          ignore_send_history?: boolean | null
          include_collections?: boolean | null
          include_filter_links?: boolean | null
          is_default?: boolean | null
          last_used_at?: string | null
          listings_filter_config?: Json | null
          listings_time_filter?: string | null
          name: string
          output_format?: string | null
          resend_after_days?: number | null
          section_by_filter?: string | null
          sort_preference?:
            | Database["public"]["Enums"]["digest_sort_option"]
            | null
          subject_template?: string | null
          template_type: Database["public"]["Enums"]["digest_template_type"]
          updated_at?: string | null
          usage_count?: number | null
          use_global_footer?: boolean | null
          use_global_header?: boolean | null
          whatsapp_intro_text?: string | null
          whatsapp_outro_text?: string | null
        }
        Update: {
          allow_resend?: boolean | null
          category?:
            | Database["public"]["Enums"]["digest_template_category"]
            | null
          category_limits?: Json | null
          collection_configs?: Json | null
          created_at?: string | null
          created_by?: string | null
          custom_footer_override?: string | null
          custom_header_override?: string | null
          description?: string | null
          filter_config?: Json | null
          filter_preset_ids?: string[] | null
          id?: string
          ignore_send_history?: boolean | null
          include_collections?: boolean | null
          include_filter_links?: boolean | null
          is_default?: boolean | null
          last_used_at?: string | null
          listings_filter_config?: Json | null
          listings_time_filter?: string | null
          name?: string
          output_format?: string | null
          resend_after_days?: number | null
          section_by_filter?: string | null
          sort_preference?:
            | Database["public"]["Enums"]["digest_sort_option"]
            | null
          subject_template?: string | null
          template_type?: Database["public"]["Enums"]["digest_template_type"]
          updated_at?: string | null
          usage_count?: number | null
          use_global_footer?: boolean | null
          use_global_header?: boolean | null
          whatsapp_intro_text?: string | null
          whatsapp_outro_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "digest_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "digest_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      favorites: {
        Row: {
          created_at: string | null
          id: string
          listing_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          listing_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          listing_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listing_metrics_v1"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "favorites_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      featured_purchases: {
        Row: {
          amount_cents: number
          created_at: string | null
          duration_days: number
          featured_end: string | null
          featured_start: string | null
          granted_by_admin_id: string | null
          id: string
          is_admin_granted: boolean | null
          listing_id: string
          metadata: Json | null
          plan: string
          promo_code_used: string | null
          purchased_at: string | null
          status: string
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amount_cents?: number
          created_at?: string | null
          duration_days: number
          featured_end?: string | null
          featured_start?: string | null
          granted_by_admin_id?: string | null
          id?: string
          is_admin_granted?: boolean | null
          listing_id: string
          metadata?: Json | null
          plan: string
          promo_code_used?: string | null
          purchased_at?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string | null
          duration_days?: number
          featured_end?: string | null
          featured_start?: string | null
          granted_by_admin_id?: string | null
          id?: string
          is_admin_granted?: boolean | null
          listing_id?: string
          metadata?: Json | null
          plan?: string
          promo_code_used?: string | null
          purchased_at?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "featured_purchases_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listing_metrics_v1"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "featured_purchases_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      filter_presets: {
        Row: {
          category: string | null
          collection_url_override: string | null
          created_at: string | null
          created_by: string | null
          custom_collection_label: string | null
          description: string | null
          display_label: string
          display_order: number | null
          filter_params: Json
          id: string
          is_active: boolean | null
          last_used_at: string | null
          name: string
          short_code: string | null
          updated_at: string | null
          usage_count: number | null
          use_for_collections: boolean | null
        }
        Insert: {
          category?: string | null
          collection_url_override?: string | null
          created_at?: string | null
          created_by?: string | null
          custom_collection_label?: string | null
          description?: string | null
          display_label: string
          display_order?: number | null
          filter_params: Json
          id?: string
          is_active?: boolean | null
          last_used_at?: string | null
          name: string
          short_code?: string | null
          updated_at?: string | null
          usage_count?: number | null
          use_for_collections?: boolean | null
        }
        Update: {
          category?: string | null
          collection_url_override?: string | null
          created_at?: string | null
          created_by?: string | null
          custom_collection_label?: string | null
          description?: string | null
          display_label?: string
          display_order?: number | null
          filter_params?: Json
          id?: string
          is_active?: boolean | null
          last_used_at?: string | null
          name?: string
          short_code?: string | null
          updated_at?: string | null
          usage_count?: number | null
          use_for_collections?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "filter_presets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "filter_presets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      footer_sections: {
        Row: {
          content_data: Json
          content_type: Database["public"]["Enums"]["footer_content_type"]
          created_at: string | null
          id: string
          is_active: boolean
          section_key: string
          sort_order: number
          title: string
          updated_at: string | null
        }
        Insert: {
          content_data?: Json
          content_type: Database["public"]["Enums"]["footer_content_type"]
          created_at?: string | null
          id?: string
          is_active?: boolean
          section_key: string
          sort_order?: number
          title: string
          updated_at?: string | null
        }
        Update: {
          content_data?: Json
          content_type?: Database["public"]["Enums"]["footer_content_type"]
          created_at?: string | null
          id?: string
          is_active?: boolean
          section_key?: string
          sort_order?: number
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      geocode_cache: {
        Row: {
          cache_key: string
          created_at: string
          expires_at: string
          hit_count: number
          input_cross_streets: string
          input_neighborhood: string | null
          result: Json
        }
        Insert: {
          cache_key: string
          created_at?: string
          expires_at?: string
          hit_count?: number
          input_cross_streets: string
          input_neighborhood?: string | null
          result: Json
        }
        Update: {
          cache_key?: string
          created_at?: string
          expires_at?: string
          hit_count?: number
          input_cross_streets?: string
          input_neighborhood?: string | null
          result?: Json
        }
        Relationships: []
      }
      hero_banners: {
        Row: {
          background_color: string | null
          created_at: string | null
          display_order: number | null
          heading: string
          id: string
          is_active: boolean | null
          is_default: boolean | null
          name: string
          subheading: string | null
          text_color: string | null
          updated_at: string | null
        }
        Insert: {
          background_color?: string | null
          created_at?: string | null
          display_order?: number | null
          heading: string
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          name: string
          subheading?: string | null
          text_color?: string | null
          updated_at?: string | null
        }
        Update: {
          background_color?: string | null
          created_at?: string | null
          display_order?: number | null
          heading?: string
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          name?: string
          subheading?: string | null
          text_color?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      knowledge_base_articles: {
        Row: {
          category_id: string
          content: string
          created_at: string | null
          excerpt: string
          helpful_count: number
          id: string
          is_published: boolean
          not_helpful_count: number
          read_time_minutes: number
          slug: string
          sort_order: number
          tags: string[] | null
          title: string
          updated_at: string | null
          view_count: number
        }
        Insert: {
          category_id: string
          content: string
          created_at?: string | null
          excerpt: string
          helpful_count?: number
          id?: string
          is_published?: boolean
          not_helpful_count?: number
          read_time_minutes?: number
          slug: string
          sort_order?: number
          tags?: string[] | null
          title: string
          updated_at?: string | null
          view_count?: number
        }
        Update: {
          category_id?: string
          content?: string
          created_at?: string | null
          excerpt?: string
          helpful_count?: number
          id?: string
          is_published?: boolean
          not_helpful_count?: number
          read_time_minutes?: number
          slug?: string
          sort_order?: number
          tags?: string[] | null
          title?: string
          updated_at?: string | null
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_base_articles_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "knowledge_base_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_base_categories: {
        Row: {
          created_at: string | null
          description: string
          icon: string
          id: string
          is_active: boolean
          name: string
          slug: string
          sort_order: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description: string
          icon?: string
          id?: string
          is_active?: boolean
          name: string
          slug: string
          sort_order?: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string
          icon?: string
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      knowledge_base_feedback: {
        Row: {
          article_id: string
          created_at: string | null
          feedback_text: string | null
          id: string
          is_helpful: boolean
          user_id: string | null
        }
        Insert: {
          article_id: string
          created_at?: string | null
          feedback_text?: string | null
          id?: string
          is_helpful: boolean
          user_id?: string | null
        }
        Update: {
          article_id?: string
          created_at?: string | null
          feedback_text?: string | null
          id?: string
          is_helpful?: boolean
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_base_feedback_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "knowledge_base_articles"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_contact_submissions: {
        Row: {
          consent_to_followup: boolean
          created_at: string
          id: string
          ip_address: string | null
          listing_id: string
          session_id: string | null
          user_agent: string | null
          user_name: string
          user_phone: string
        }
        Insert: {
          consent_to_followup?: boolean
          created_at?: string
          id?: string
          ip_address?: string | null
          listing_id: string
          session_id?: string | null
          user_agent?: string | null
          user_name: string
          user_phone: string
        }
        Update: {
          consent_to_followup?: boolean
          created_at?: string
          id?: string
          ip_address?: string | null
          listing_id?: string
          session_id?: string | null
          user_agent?: string | null
          user_name?: string
          user_phone?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_contact_submissions_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listing_metrics_v1"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "listing_contact_submissions_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_images: {
        Row: {
          created_at: string | null
          id: string
          image_url: string
          is_featured: boolean | null
          listing_id: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          image_url: string
          is_featured?: boolean | null
          listing_id: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          image_url?: string
          is_featured?: boolean | null
          listing_id?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "listing_images_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listing_metrics_v1"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "listing_images_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_renewal_conversations: {
        Row: {
          action_taken: string | null
          batch_id: string | null
          conversation_type: string | null
          created_at: string | null
          expires_at: string
          hadirot_conversion: boolean | null
          id: string
          is_commercial: boolean
          listing_id: string | null
          listing_index: number | null
          message_sent_at: string | null
          message_sid: string | null
          metadata: Json | null
          phone_number: string
          reply_received_at: string | null
          reply_text: string | null
          state: string | null
          total_in_batch: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          action_taken?: string | null
          batch_id?: string | null
          conversation_type?: string | null
          created_at?: string | null
          expires_at: string
          hadirot_conversion?: boolean | null
          id?: string
          is_commercial?: boolean
          listing_id?: string | null
          listing_index?: number | null
          message_sent_at?: string | null
          message_sid?: string | null
          metadata?: Json | null
          phone_number: string
          reply_received_at?: string | null
          reply_text?: string | null
          state?: string | null
          total_in_batch?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          action_taken?: string | null
          batch_id?: string | null
          conversation_type?: string | null
          created_at?: string | null
          expires_at?: string
          hadirot_conversion?: boolean | null
          id?: string
          is_commercial?: boolean
          listing_id?: string | null
          listing_index?: number | null
          message_sent_at?: string | null
          message_sid?: string | null
          metadata?: Json | null
          phone_number?: string
          reply_received_at?: string | null
          reply_text?: string | null
          state?: string | null
          total_in_batch?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "listing_renewal_conversations_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listing_metrics_v1"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "listing_renewal_conversations_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_renewal_conversations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_renewal_conversations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          ac_type: string | null
          additional_rooms: number | null
          admin_custom_agency_name: string | null
          admin_listing_type_display: string | null
          agency_id: string | null
          apartment_conditions: string[] | null
          appliances: string[] | null
          approved: boolean
          asking_price: number | null
          basement_notes: string | null
          basement_type: Database["public"]["Enums"]["basement_type"] | null
          bathrooms: number
          bedrooms: number
          broker_fee: boolean
          building_length_ft: number | null
          building_size_sqft: number | null
          building_type: string | null
          building_width_ft: number | null
          call_for_price: boolean
          city: string | null
          contact_name: string
          contact_phone: string
          contact_phone_e164: string | null
          cooling_type: Database["public"]["Enums"]["cooling_type"] | null
          created_at: string | null
          cross_street_a: string | null
          cross_street_b: string | null
          cross_streets: string | null
          deactivated_at: string | null
          delivery_condition:
            | Database["public"]["Enums"]["delivery_condition"]
            | null
          description: string | null
          dishwasher: boolean | null
          driveway_status: Database["public"]["Enums"]["driveway_status"] | null
          expires_at: string | null
          featured_expires_at: string | null
          featured_plan: string | null
          featured_started_at: string | null
          featured_until: string | null
          floor: number | null
          full_address: string | null
          hadirot_conversion: boolean | null
          heat: Database["public"]["Enums"]["heat_type"] | null
          heating_type: Database["public"]["Enums"]["heating_type"] | null
          hoa_fees: number | null
          id: string
          interior_features: string[] | null
          is_active: boolean | null
          is_featured: boolean | null
          last_deactivation_email_sent_at: string | null
          last_published_at: string
          latitude: number | null
          laundry_type: Database["public"]["Enums"]["laundry_type"] | null
          lease_length: Database["public"]["Enums"]["lease_length_type"] | null
          listing_type: Database["public"]["Enums"]["listing_type"]
          location: string
          longitude: number | null
          lot_size_sqft: number | null
          multi_family: boolean | null
          neighborhood: string | null
          number_of_floors: number | null
          occupancy_status:
            | Database["public"]["Enums"]["occupancy_status"]
            | null
          outdoor_space: string[] | null
          parking: Database["public"]["Enums"]["parking_type"] | null
          payment_status:
            | Database["public"]["Enums"]["listing_payment_status"]
            | null
          price: number | null
          property_age: number | null
          property_condition:
            | Database["public"]["Enums"]["property_condition"]
            | null
          property_length_ft: number | null
          property_taxes: number | null
          property_type: Database["public"]["Enums"]["property_type"]
          property_width_ft: number | null
          rent_roll_data: Json | null
          rent_roll_total: number | null
          requires_payment: boolean | null
          sale_status: Database["public"]["Enums"]["sale_status"] | null
          square_footage: number | null
          tenant_notes: string | null
          title: string
          unit_count: number | null
          updated_at: string | null
          user_id: string | null
          utilities_included: string[] | null
          video_thumbnail_url: string | null
          video_url: string | null
          views: number | null
          washer_dryer_hookup: boolean | null
          year_built: number | null
          year_renovated: number | null
          zip_code: string | null
        }
        Insert: {
          ac_type?: string | null
          additional_rooms?: number | null
          admin_custom_agency_name?: string | null
          admin_listing_type_display?: string | null
          agency_id?: string | null
          apartment_conditions?: string[] | null
          appliances?: string[] | null
          approved?: boolean
          asking_price?: number | null
          basement_notes?: string | null
          basement_type?: Database["public"]["Enums"]["basement_type"] | null
          bathrooms: number
          bedrooms: number
          broker_fee?: boolean
          building_length_ft?: number | null
          building_size_sqft?: number | null
          building_type?: string | null
          building_width_ft?: number | null
          call_for_price?: boolean
          city?: string | null
          contact_name: string
          contact_phone: string
          contact_phone_e164?: string | null
          cooling_type?: Database["public"]["Enums"]["cooling_type"] | null
          created_at?: string | null
          cross_street_a?: string | null
          cross_street_b?: string | null
          cross_streets?: string | null
          deactivated_at?: string | null
          delivery_condition?:
            | Database["public"]["Enums"]["delivery_condition"]
            | null
          description?: string | null
          dishwasher?: boolean | null
          driveway_status?:
            | Database["public"]["Enums"]["driveway_status"]
            | null
          expires_at?: string | null
          featured_expires_at?: string | null
          featured_plan?: string | null
          featured_started_at?: string | null
          featured_until?: string | null
          floor?: number | null
          full_address?: string | null
          hadirot_conversion?: boolean | null
          heat?: Database["public"]["Enums"]["heat_type"] | null
          heating_type?: Database["public"]["Enums"]["heating_type"] | null
          hoa_fees?: number | null
          id?: string
          interior_features?: string[] | null
          is_active?: boolean | null
          is_featured?: boolean | null
          last_deactivation_email_sent_at?: string | null
          last_published_at?: string
          latitude?: number | null
          laundry_type?: Database["public"]["Enums"]["laundry_type"] | null
          lease_length?: Database["public"]["Enums"]["lease_length_type"] | null
          listing_type?: Database["public"]["Enums"]["listing_type"]
          location: string
          longitude?: number | null
          lot_size_sqft?: number | null
          multi_family?: boolean | null
          neighborhood?: string | null
          number_of_floors?: number | null
          occupancy_status?:
            | Database["public"]["Enums"]["occupancy_status"]
            | null
          outdoor_space?: string[] | null
          parking?: Database["public"]["Enums"]["parking_type"] | null
          payment_status?:
            | Database["public"]["Enums"]["listing_payment_status"]
            | null
          price?: number | null
          property_age?: number | null
          property_condition?:
            | Database["public"]["Enums"]["property_condition"]
            | null
          property_length_ft?: number | null
          property_taxes?: number | null
          property_type: Database["public"]["Enums"]["property_type"]
          property_width_ft?: number | null
          rent_roll_data?: Json | null
          rent_roll_total?: number | null
          requires_payment?: boolean | null
          sale_status?: Database["public"]["Enums"]["sale_status"] | null
          square_footage?: number | null
          tenant_notes?: string | null
          title: string
          unit_count?: number | null
          updated_at?: string | null
          user_id?: string | null
          utilities_included?: string[] | null
          video_thumbnail_url?: string | null
          video_url?: string | null
          views?: number | null
          washer_dryer_hookup?: boolean | null
          year_built?: number | null
          year_renovated?: number | null
          zip_code?: string | null
        }
        Update: {
          ac_type?: string | null
          additional_rooms?: number | null
          admin_custom_agency_name?: string | null
          admin_listing_type_display?: string | null
          agency_id?: string | null
          apartment_conditions?: string[] | null
          appliances?: string[] | null
          approved?: boolean
          asking_price?: number | null
          basement_notes?: string | null
          basement_type?: Database["public"]["Enums"]["basement_type"] | null
          bathrooms?: number
          bedrooms?: number
          broker_fee?: boolean
          building_length_ft?: number | null
          building_size_sqft?: number | null
          building_type?: string | null
          building_width_ft?: number | null
          call_for_price?: boolean
          city?: string | null
          contact_name?: string
          contact_phone?: string
          contact_phone_e164?: string | null
          cooling_type?: Database["public"]["Enums"]["cooling_type"] | null
          created_at?: string | null
          cross_street_a?: string | null
          cross_street_b?: string | null
          cross_streets?: string | null
          deactivated_at?: string | null
          delivery_condition?:
            | Database["public"]["Enums"]["delivery_condition"]
            | null
          description?: string | null
          dishwasher?: boolean | null
          driveway_status?:
            | Database["public"]["Enums"]["driveway_status"]
            | null
          expires_at?: string | null
          featured_expires_at?: string | null
          featured_plan?: string | null
          featured_started_at?: string | null
          featured_until?: string | null
          floor?: number | null
          full_address?: string | null
          hadirot_conversion?: boolean | null
          heat?: Database["public"]["Enums"]["heat_type"] | null
          heating_type?: Database["public"]["Enums"]["heating_type"] | null
          hoa_fees?: number | null
          id?: string
          interior_features?: string[] | null
          is_active?: boolean | null
          is_featured?: boolean | null
          last_deactivation_email_sent_at?: string | null
          last_published_at?: string
          latitude?: number | null
          laundry_type?: Database["public"]["Enums"]["laundry_type"] | null
          lease_length?: Database["public"]["Enums"]["lease_length_type"] | null
          listing_type?: Database["public"]["Enums"]["listing_type"]
          location?: string
          longitude?: number | null
          lot_size_sqft?: number | null
          multi_family?: boolean | null
          neighborhood?: string | null
          number_of_floors?: number | null
          occupancy_status?:
            | Database["public"]["Enums"]["occupancy_status"]
            | null
          outdoor_space?: string[] | null
          parking?: Database["public"]["Enums"]["parking_type"] | null
          payment_status?:
            | Database["public"]["Enums"]["listing_payment_status"]
            | null
          price?: number | null
          property_age?: number | null
          property_condition?:
            | Database["public"]["Enums"]["property_condition"]
            | null
          property_length_ft?: number | null
          property_taxes?: number | null
          property_type?: Database["public"]["Enums"]["property_type"]
          property_width_ft?: number | null
          rent_roll_data?: Json | null
          rent_roll_total?: number | null
          requires_payment?: boolean | null
          sale_status?: Database["public"]["Enums"]["sale_status"] | null
          square_footage?: number | null
          tenant_notes?: string | null
          title?: string
          unit_count?: number | null
          updated_at?: string | null
          user_id?: string | null
          utilities_included?: string[] | null
          video_thumbnail_url?: string | null
          video_url?: string | null
          views?: number | null
          washer_dryer_hookup?: boolean | null
          year_built?: number | null
          year_renovated?: number | null
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "listings_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agency_page_metrics_v1"
            referencedColumns: ["agency_id"]
          },
          {
            foreignKeyName: "listings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      location_search_index: {
        Row: {
          aliases: string[] | null
          bounds_east: number | null
          bounds_north: number | null
          bounds_south: number | null
          bounds_west: number | null
          center_lat: number
          center_lng: number
          created_at: string | null
          id: string
          name: string
          type: string
          zip_codes: string[] | null
        }
        Insert: {
          aliases?: string[] | null
          bounds_east?: number | null
          bounds_north?: number | null
          bounds_south?: number | null
          bounds_west?: number | null
          center_lat: number
          center_lng: number
          created_at?: string | null
          id?: string
          name: string
          type: string
          zip_codes?: string[] | null
        }
        Update: {
          aliases?: string[] | null
          bounds_east?: number | null
          bounds_north?: number | null
          bounds_south?: number | null
          bounds_west?: number | null
          center_lat?: number
          center_lng?: number
          created_at?: string | null
          id?: string
          name?: string
          type?: string
          zip_codes?: string[] | null
        }
        Relationships: []
      }
      modal_popups: {
        Row: {
          additional_text_lines: Json | null
          button_text: string
          button_url: string
          created_at: string | null
          custom_interval_hours: number | null
          delay_seconds: number | null
          display_frequency: string
          heading: string
          id: string
          is_active: boolean | null
          name: string
          priority: number | null
          subheading: string | null
          trigger_pages: Json | null
          updated_at: string | null
        }
        Insert: {
          additional_text_lines?: Json | null
          button_text: string
          button_url: string
          created_at?: string | null
          custom_interval_hours?: number | null
          delay_seconds?: number | null
          display_frequency?: string
          heading: string
          id?: string
          is_active?: boolean | null
          name: string
          priority?: number | null
          subheading?: string | null
          trigger_pages?: Json | null
          updated_at?: string | null
        }
        Update: {
          additional_text_lines?: Json | null
          button_text?: string
          button_url?: string
          created_at?: string | null
          custom_interval_hours?: number | null
          delay_seconds?: number | null
          display_frequency?: string
          heading?: string
          id?: string
          is_active?: boolean | null
          name?: string
          priority?: number | null
          subheading?: string | null
          trigger_pages?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      modal_user_interactions: {
        Row: {
          id: string
          interaction_timestamp: string | null
          interaction_type: string
          modal_id: string
          page_path: string
          session_id: string
          user_fingerprint: string
          user_id: string | null
        }
        Insert: {
          id?: string
          interaction_timestamp?: string | null
          interaction_type: string
          modal_id: string
          page_path: string
          session_id: string
          user_fingerprint: string
          user_id?: string | null
        }
        Update: {
          id?: string
          interaction_timestamp?: string | null
          interaction_type?: string
          modal_id?: string
          page_path?: string
          session_id?: string
          user_fingerprint?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "modal_user_interactions_modal_id_fkey"
            columns: ["modal_id"]
            isOneToOne: false
            referencedRelation: "modal_popups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "modal_user_interactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "modal_user_interactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          agency: string | null
          can_feature_listings: boolean | null
          can_manage_agency: boolean
          can_post_sales: boolean | null
          created_at: string | null
          email: string | null
          full_name: string
          has_active_subscription: boolean | null
          id: string
          is_admin: boolean | null
          is_banned: boolean | null
          max_featured_listings_per_user: number | null
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          stripe_customer_id: string | null
          updated_at: string | null
        }
        Insert: {
          agency?: string | null
          can_feature_listings?: boolean | null
          can_manage_agency?: boolean
          can_post_sales?: boolean | null
          created_at?: string | null
          email?: string | null
          full_name: string
          has_active_subscription?: boolean | null
          id: string
          is_admin?: boolean | null
          is_banned?: boolean | null
          max_featured_listings_per_user?: number | null
          phone?: string | null
          role: Database["public"]["Enums"]["user_role"]
          stripe_customer_id?: string | null
          updated_at?: string | null
        }
        Update: {
          agency?: string | null
          can_feature_listings?: boolean | null
          can_manage_agency?: boolean
          can_post_sales?: boolean | null
          created_at?: string | null
          email?: string | null
          full_name?: string
          has_active_subscription?: boolean | null
          id?: string
          is_admin?: boolean | null
          is_banned?: boolean | null
          max_featured_listings_per_user?: number | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          stripe_customer_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      sales_permission_requests: {
        Row: {
          admin_notes: string | null
          created_at: string | null
          id: string
          request_message: string
          requested_at: string
          responded_at: string | null
          responded_by_admin_id: string | null
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string | null
          id?: string
          request_message: string
          requested_at?: string
          responded_at?: string | null
          responded_by_admin_id?: string | null
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          created_at?: string | null
          id?: string
          request_message?: string
          requested_at?: string
          responded_at?: string | null
          responded_by_admin_id?: string | null
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_permission_requests_responded_by_admin_id_fkey"
            columns: ["responded_by_admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_permission_requests_responded_by_admin_id_fkey"
            columns: ["responded_by_admin_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_permission_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_permission_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      scrape_runs: {
        Row: {
          completed_at: string | null
          errors: Json | null
          id: string
          listings_geocoded: number | null
          listings_inserted: number | null
          listings_parsed: number | null
          listings_updated: number | null
          pdf_date: string
          pdf_filename: string | null
          rental_pages_found: number | null
          source: string
          started_at: string | null
          status: string | null
          total_pages: number | null
        }
        Insert: {
          completed_at?: string | null
          errors?: Json | null
          id?: string
          listings_geocoded?: number | null
          listings_inserted?: number | null
          listings_parsed?: number | null
          listings_updated?: number | null
          pdf_date: string
          pdf_filename?: string | null
          rental_pages_found?: number | null
          source?: string
          started_at?: string | null
          status?: string | null
          total_pages?: number | null
        }
        Update: {
          completed_at?: string | null
          errors?: Json | null
          id?: string
          listings_geocoded?: number | null
          listings_inserted?: number | null
          listings_parsed?: number | null
          listings_updated?: number | null
          pdf_date?: string
          pdf_filename?: string | null
          rental_pages_found?: number | null
          source?: string
          started_at?: string | null
          status?: string | null
          total_pages?: number | null
        }
        Relationships: []
      }
      scraped_listings: {
        Row: {
          additional_notes: string | null
          agency_name: string | null
          basement: boolean | null
          bathrooms: number | null
          bedrooms: number | null
          call_notes: string | null
          call_status: string
          contact_name: string | null
          contact_phone: string | null
          contact_phone_display: string | null
          contact_type: Database["public"]["Enums"]["contact_type"] | null
          created_at: string | null
          cross_street_1: string | null
          cross_street_2: string | null
          cross_streets_raw: string | null
          date_first_seen: string
          date_last_seen: string
          dedup_key: string
          existing_listing_id: string | null
          floor: number | null
          geocode_status: string | null
          has_porch: boolean | null
          heat_included: boolean | null
          id: string
          is_active: boolean | null
          is_furnished: boolean | null
          latitude: number | null
          longitude: number | null
          match_status: string | null
          neighborhood: string | null
          parking: boolean | null
          parse_confidence: number | null
          pdf_date: string
          price: number | null
          price_note: string | null
          property_type: string
          published_listing_id: string | null
          raw_text: string | null
          rental_term: Database["public"]["Enums"]["rental_term_type"]
          section_8_ok: boolean | null
          separate_entrance: boolean | null
          source: string
          square_footage: number | null
          times_seen: number | null
          title: string
          updated_at: string | null
          utilities_included: boolean | null
          washer_dryer: boolean | null
        }
        Insert: {
          additional_notes?: string | null
          agency_name?: string | null
          basement?: boolean | null
          bathrooms?: number | null
          bedrooms?: number | null
          call_notes?: string | null
          call_status?: string
          contact_name?: string | null
          contact_phone?: string | null
          contact_phone_display?: string | null
          contact_type?: Database["public"]["Enums"]["contact_type"] | null
          created_at?: string | null
          cross_street_1?: string | null
          cross_street_2?: string | null
          cross_streets_raw?: string | null
          date_first_seen: string
          date_last_seen: string
          dedup_key: string
          existing_listing_id?: string | null
          floor?: number | null
          geocode_status?: string | null
          has_porch?: boolean | null
          heat_included?: boolean | null
          id?: string
          is_active?: boolean | null
          is_furnished?: boolean | null
          latitude?: number | null
          longitude?: number | null
          match_status?: string | null
          neighborhood?: string | null
          parking?: boolean | null
          parse_confidence?: number | null
          pdf_date: string
          price?: number | null
          price_note?: string | null
          property_type?: string
          published_listing_id?: string | null
          raw_text?: string | null
          rental_term?: Database["public"]["Enums"]["rental_term_type"]
          section_8_ok?: boolean | null
          separate_entrance?: boolean | null
          source?: string
          square_footage?: number | null
          times_seen?: number | null
          title: string
          updated_at?: string | null
          utilities_included?: boolean | null
          washer_dryer?: boolean | null
        }
        Update: {
          additional_notes?: string | null
          agency_name?: string | null
          basement?: boolean | null
          bathrooms?: number | null
          bedrooms?: number | null
          call_notes?: string | null
          call_status?: string
          contact_name?: string | null
          contact_phone?: string | null
          contact_phone_display?: string | null
          contact_type?: Database["public"]["Enums"]["contact_type"] | null
          created_at?: string | null
          cross_street_1?: string | null
          cross_street_2?: string | null
          cross_streets_raw?: string | null
          date_first_seen?: string
          date_last_seen?: string
          dedup_key?: string
          existing_listing_id?: string | null
          floor?: number | null
          geocode_status?: string | null
          has_porch?: boolean | null
          heat_included?: boolean | null
          id?: string
          is_active?: boolean | null
          is_furnished?: boolean | null
          latitude?: number | null
          longitude?: number | null
          match_status?: string | null
          neighborhood?: string | null
          parking?: boolean | null
          parse_confidence?: number | null
          pdf_date?: string
          price?: number | null
          price_note?: string | null
          property_type?: string
          published_listing_id?: string | null
          raw_text?: string | null
          rental_term?: Database["public"]["Enums"]["rental_term_type"]
          section_8_ok?: boolean | null
          separate_entrance?: boolean | null
          source?: string
          square_footage?: number | null
          times_seen?: number | null
          title?: string
          updated_at?: string | null
          utilities_included?: boolean | null
          washer_dryer?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "scraped_listings_existing_listing_id_fkey"
            columns: ["existing_listing_id"]
            isOneToOne: false
            referencedRelation: "listing_metrics_v1"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "scraped_listings_existing_listing_id_fkey"
            columns: ["existing_listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scraped_listings_published_listing_id_fkey"
            columns: ["published_listing_id"]
            isOneToOne: false
            referencedRelation: "listing_metrics_v1"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "scraped_listings_published_listing_id_fkey"
            columns: ["published_listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      short_urls: {
        Row: {
          alias: string | null
          click_count: number | null
          created_at: string | null
          expires_at: string | null
          id: string
          last_clicked_at: string | null
          listing_id: string | null
          original_url: string
          short_code: string
          source: string
        }
        Insert: {
          alias?: string | null
          click_count?: number | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          last_clicked_at?: string | null
          listing_id?: string | null
          original_url: string
          short_code: string
          source?: string
        }
        Update: {
          alias?: string | null
          click_count?: number | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          last_clicked_at?: string | null
          listing_id?: string | null
          original_url?: string
          short_code?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "short_urls_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listing_metrics_v1"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "short_urls_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_admin_config: {
        Row: {
          admin_email: string | null
          created_at: string | null
          id: number
          notify_on_errors: boolean | null
          notify_on_timeouts: boolean | null
          notify_on_unrecognized: boolean | null
          updated_at: string | null
        }
        Insert: {
          admin_email?: string | null
          created_at?: string | null
          id?: number
          notify_on_errors?: boolean | null
          notify_on_timeouts?: boolean | null
          notify_on_unrecognized?: boolean | null
          updated_at?: string | null
        }
        Update: {
          admin_email?: string | null
          created_at?: string | null
          id?: number
          notify_on_errors?: boolean | null
          notify_on_timeouts?: boolean | null
          notify_on_unrecognized?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
      sms_messages: {
        Row: {
          conversation_id: string | null
          created_at: string | null
          direction: string
          id: string
          listing_id: string | null
          message_body: string
          message_sid: string | null
          message_source: string | null
          metadata: Json | null
          phone_number: string
          status: string | null
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string | null
          direction: string
          id?: string
          listing_id?: string | null
          message_body: string
          message_sid?: string | null
          message_source?: string | null
          metadata?: Json | null
          phone_number: string
          status?: string | null
        }
        Update: {
          conversation_id?: string | null
          created_at?: string | null
          direction?: string
          id?: string
          listing_id?: string | null
          message_body?: string
          message_sid?: string | null
          message_source?: string | null
          metadata?: Json | null
          phone_number?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "listing_renewal_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_messages_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listing_metrics_v1"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "sms_messages_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      static_pages: {
        Row: {
          content: string
          id: string
          published: boolean
          slug: string
          title: string
          updated_at: string | null
        }
        Insert: {
          content: string
          id: string
          published?: boolean
          slug: string
          title: string
          updated_at?: string | null
        }
        Update: {
          content?: string
          id?: string
          published?: boolean
          slug?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      agency_page_metrics_v1: {
        Row: {
          agency_id: string | null
          views_30d: number | null
          views_total: number | null
        }
        Relationships: []
      }
      listing_metrics_v1: {
        Row: {
          direct_views: number | null
          impressions: number | null
          listing_id: string | null
        }
        Relationships: []
      }
      public_profiles: {
        Row: {
          agency: string | null
          full_name: string | null
          id: string | null
          role: Database["public"]["Enums"]["user_role"] | null
        }
        Insert: {
          agency?: string | null
          full_name?: string | null
          id?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
        }
        Update: {
          agency?: string | null
          full_name?: string | null
          id?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
        }
        Relationships: []
      }
      short_url_analytics: {
        Row: {
          click_count: number | null
          created_at: string | null
          expires_at: string | null
          id: string | null
          last_clicked_at: string | null
          listing_id: string | null
          listing_title: string | null
          short_code: string | null
          source: string | null
          status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "short_urls_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listing_metrics_v1"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "short_urls_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _analytics_events_count_range: {
        Args: { p_end_ts: string; p_event_name: string; p_start_ts: string }
        Returns: number
      }
      _analytics_impressions_range: {
        Args: { p_end_ts: string; p_start_ts: string }
        Returns: number
      }
      _analytics_inquiries_count_range: {
        Args: { p_end_ts: string; p_start_ts: string }
        Returns: number
      }
      analytics_abuse_signals: {
        Args: {
          days_back?: number
          extreme_threshold?: number
          mild_threshold?: number
          tz?: string
        }
        Returns: {
          first_inquiry: string
          inquiry_count: number
          last_inquiry: string
          listings_contacted: number
          phone_masked: string
          severity: string
        }[]
      }
      analytics_agency_metrics: {
        Args: { days_back?: number; tz?: string }
        Returns: {
          agency_filter_applies: number
          agency_page_views: number
          agency_shares: number
        }[]
      }
      analytics_contact_submissions: {
        Args: { days_back?: number; limit_count?: number; tz?: string }
        Returns: {
          bedrooms: number
          consent_to_followup: boolean
          contact_name: string
          contact_phone: string
          listing_id: string
          listing_location: string
          listing_neighborhood: string
          listing_title: string
          price: number
          submission_date: string
          submission_id: string
          user_name: string
          user_phone: string
        }[]
      }
      analytics_contact_submissions_summary: {
        Args: { days_back?: number; tz?: string }
        Returns: {
          consent_rate: number
          submissions_with_consent: number
          total_submissions: number
          unique_listings: number
        }[]
      }
      analytics_engagement_funnel: {
        Args: { days_back?: number; tz?: string }
        Returns: {
          phone_dial_rate: number
          phone_dials: number
          phone_reveals: number
          pin_click_rate: number
          pin_clicks: number
          total_impressions: number
          total_inquiries: number
          total_sessions: number
          total_views: number
        }[]
      }
      analytics_funnel_abandonment_details: {
        Args: { days_back?: number; tz?: string }
        Returns: {
          avg_time_before_abandon_minutes: number
          started_not_submitted: number
          submitted_not_completed: number
          total_abandoned: number
        }[]
      }
      analytics_inquiry_conversion_funnel: {
        Args: { days_back?: number; tz?: string }
        Returns: {
          combined_inquiry_rate: number
          contact_form_session_rate: number
          contact_form_view_rate: number
          contact_forms: number
          phone_dial_conversion_rate: number
          phone_dials: number
          phone_reveal_session_rate: number
          phone_reveal_view_rate: number
          phone_reveals: number
          total_listing_views: number
          total_sessions: number
        }[]
      }
      analytics_inquiry_demand: {
        Args: { days_back?: number; tz?: string }
        Returns: {
          by_bedrooms: Json
          by_neighborhood: Json
          by_price_band: Json
        }[]
      }
      analytics_inquiry_demand_breakdown_dual: {
        Args: { days_back?: number; tz?: string }
        Returns: {
          by_bedrooms_forms: Json
          by_bedrooms_phones: Json
          by_neighborhood_forms: Json
          by_neighborhood_phones: Json
          by_price_band_forms: Json
          by_price_band_phones: Json
        }[]
      }
      analytics_inquiry_listings_performance_dual: {
        Args: { days_back?: number; limit_count?: number; tz?: string }
        Returns: {
          bedrooms: number
          contact_forms: number
          conversion_rate: number
          is_featured: boolean
          listing_id: string
          location: string
          neighborhood: string
          phone_reveals: number
          posted_by: string
          price: number
          title: string
          total_inquiries: number
        }[]
      }
      analytics_inquiry_overview_dual: {
        Args: { days_back?: number; tz?: string }
        Returns: {
          contact_forms: number
          contact_forms_prev: number
          phone_dials: number
          phone_dials_prev: number
          phone_reveals: number
          phone_reveals_prev: number
          total_inquiries: number
          total_inquiries_prev: number
          unique_phones_form: number
          unique_sessions_phone: number
        }[]
      }
      analytics_inquiry_quality: {
        Args: { days_back?: number; tz?: string }
        Returns: {
          avg_listings_per_inquirer: number
          repeat_rate: number
          total_inquiries: number
          unique_phones: number
        }[]
      }
      analytics_inquiry_quality_metrics: {
        Args: { days_back?: number; tz?: string }
        Returns: {
          avg_listings_per_user: number
          avg_time_to_first_inquiry_hours: number
          repeat_inquiry_rate: number
        }[]
      }
      analytics_inquiry_timing: {
        Args: { days_back?: number; tz?: string }
        Returns: {
          count: number
          day_of_week: number
          hour_of_day: number
        }[]
      }
      analytics_inquiry_timing_phones: {
        Args: { days_back?: number; tz?: string }
        Returns: {
          count: number
          day_of_week: number
          hour_of_day: number
        }[]
      }
      analytics_inquiry_trend: {
        Args: { days_back?: number; tz?: string }
        Returns: {
          date: string
          inquiry_count: number
          phone_reveal_count: number
        }[]
      }
      analytics_inquiry_user_behavior: {
        Args: { days_back?: number; tz?: string }
        Returns: {
          both_count: number
          form_only_count: number
          phone_only_count: number
        }[]
      }
      analytics_inquiry_velocity: {
        Args: { days_back?: number; tz?: string }
        Returns: {
          bucket: string
          count: number
          percentage: number
        }[]
      }
      analytics_kpis: {
        Args: { days_back?: number; tz?: string }
        Returns: {
          avg_session_minutes: number
          daily_active: number
          listing_views: number
          unique_visitors: number
        }[]
      }
      analytics_kpis_with_sparkline: {
        Args: { tz?: string }
        Returns: {
          avg_session_duration: number
          sparkline_dau: number[]
          total_inquiries: number
          total_sessions: number
          total_views: number
        }[]
      }
      analytics_listing_drilldown: {
        Args: { days_back?: number; p_listing_id: string; tz?: string }
        Returns: {
          bedrooms: number
          created_at: string
          ctr: number
          hours_to_first_inquiry: number
          impressions: number
          inquiries: Json
          inquiry_count: number
          is_featured: boolean
          listing_id: string
          location: string
          neighborhood: string
          phone_reveals: number
          price: number
          title: string
          views: number
          views_by_day: Json
        }[]
      }
      analytics_listings_performance: {
        Args: { days_back?: number; limit_count?: number; tz?: string }
        Returns: {
          bedrooms: number
          ctr: number
          hours_to_first_inquiry: number
          impressions: number
          inquiry_count: number
          is_featured: boolean
          listing_id: string
          location: string
          neighborhood: string
          phone_reveal_count: number
          posted_by: string
          price: number
          title: string
          views: number
        }[]
      }
      analytics_page_impressions: {
        Args: { days_back?: number; limit_count?: number; tz?: string }
        Returns: {
          page_path: string
          view_count: number
        }[]
      }
      analytics_period_comparison: {
        Args: { days_back?: number; tz?: string }
        Returns: {
          change_direction: string
          change_percent: number
          current_value: number
          metric_name: string
          previous_value: number
        }[]
      }
      analytics_posting_funnel: {
        Args: { days_back?: number; tz?: string }
        Returns: {
          abandon_rate: number
          abandoned: number
          starts: number
          submits: number
          success_rate: number
          successes: number
        }[]
      }
      analytics_session_quality: {
        Args: { days_back?: number; tz?: string }
        Returns: {
          avg_duration_minutes: number
          bounce_rate: number
          pages_per_session: number
          returning_visitor_rate: number
          total_sessions: number
          unique_visitors: number
        }[]
      }
      analytics_summary: {
        Args: { days_back?: number; tz?: string }
        Returns: {
          post_abandoned: number
          post_starts: number
          post_submits: number
          post_successes: number
          total_inquiries: number
          total_listing_views: number
          total_page_views: number
          total_sessions: number
        }[]
      }
      analytics_summary_v2: {
        Args: { days_back?: number }
        Returns: {
          post_abandoned: number
          post_starts: number
          post_submits: number
          post_successes: number
        }[]
      }
      analytics_supply_stats: {
        Args: { days_back?: number; tz?: string }
        Returns: {
          active_count: number
          inactive_count: number
          new_listings_by_day: Json
          total_new_listings: number
        }[]
      }
      analytics_top_filters: {
        Args: { days_back?: number; limit_count?: number; tz?: string }
        Returns: {
          filter_key: string
          filter_value: string
          uses: number
        }[]
      }
      analytics_top_inquired_listings: {
        Args: { days_back?: number; limit_count?: number; tz?: string }
        Returns: {
          bedrooms: number
          inquiry_count: number
          is_featured: boolean
          listing_id: string
          location: string
          neighborhood: string
          posted_by: string
          price: number
          title: string
        }[]
      }
      analytics_top_listings: {
        Args: { days_back?: number; limit_count?: number; tz?: string }
        Returns: {
          ctr: number
          impressions: number
          listing_id: string
          views: number
        }[]
      }
      analytics_top_listings_detailed: {
        Args: { days_back?: number; limit_count?: number; tz?: string }
        Returns: {
          bedrooms: number
          ctr: number
          hours_to_first_inquiry: number
          impressions: number
          inquiry_count: number
          is_featured: boolean
          listing_id: string
          location: string
          neighborhood: string
          phone_click_count: number
          posted_by: string
          price: number
          title: string
          views: number
        }[]
      }
      analytics_validation_report: {
        Args: { end_date: string; start_date: string; tz?: string }
        Returns: {
          actual_value: number
          details: Json
          expected_value: number
          metric_name: string
          status: string
          variance_percent: number
        }[]
      }
      analytics_zero_inquiry_listings: {
        Args: { days_back?: number; min_views?: number; tz?: string }
        Returns: {
          bedrooms: number
          days_since_posted: number
          is_featured: boolean
          listing_id: string
          location: string
          neighborhood: string
          price: number
          title: string
          views: number
        }[]
      }
      auto_delete_very_old_commercial_listings: {
        Args: never
        Returns: {
          affected_count: number
          affected_ids: string[]
        }[]
      }
      auto_delete_very_old_listings: {
        Args: never
        Returns: {
          deleted_count: number
          listing_ids: string[]
        }[]
      }
      auto_inactivate_old_commercial_listings: {
        Args: never
        Returns: {
          affected_count: number
          affected_ids: string[]
        }[]
      }
      auto_inactivate_old_listings: {
        Args: never
        Returns: {
          inactivated_count: number
          listing_ids: string[]
        }[]
      }
      cleanup_analytics_events: { Args: never; Returns: undefined }
      close_session: {
        Args: { p_session: string; p_ts: string }
        Returns: undefined
      }
      create_short_url:
        | {
            Args: {
              p_expires_days?: number
              p_listing_id: string
              p_original_url: string
              p_source?: string
            }
            Returns: string
          }
        | {
            Args: { p_created_by?: string; p_original_url: string }
            Returns: string
          }
        | {
            Args: { custom_code?: string; target_url: string }
            Returns: string
          }
      deactivate_old_listings: { Args: never; Returns: undefined }
      delete_very_old_listings: { Args: never; Returns: undefined }
      ensure_agency_for_owner: {
        Args: { p_owner: string }
        Returns: {
          about_html: string | null
          banner_url: string | null
          created_at: string
          email: string | null
          has_active_subscription: boolean | null
          has_paid_profile_page: boolean | null
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          owner_profile_id: string | null
          phone: string | null
          slug: string
          stripe_customer_id: string | null
          updated_at: string
          website: string | null
        }
        SetofOptions: {
          from: "*"
          to: "agencies"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      expire_featured_listings: { Args: never; Returns: undefined }
      generate_short_code: { Args: never; Returns: string }
      get_agency_by_owner: {
        Args: { p_profile_id: string }
        Returns: {
          about_html: string | null
          banner_url: string | null
          created_at: string
          email: string | null
          has_active_subscription: boolean | null
          has_paid_profile_page: boolean | null
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          owner_profile_id: string | null
          phone: string | null
          slug: string
          stripe_customer_id: string | null
          updated_at: string
          website: string | null
        }
        SetofOptions: {
          from: "*"
          to: "agencies"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_agency_by_slug: {
        Args: { p_slug: string }
        Returns: {
          about_html: string | null
          banner_url: string | null
          created_at: string
          email: string | null
          has_active_subscription: boolean | null
          has_paid_profile_page: boolean | null
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          owner_profile_id: string | null
          phone: string | null
          slug: string
          stripe_customer_id: string | null
          updated_at: string
          website: string | null
        }
        SetofOptions: {
          from: "*"
          to: "agencies"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_featured_listings_count: { Args: never; Returns: number }
      get_featured_listings_count_by_user: {
        Args: { user_id: string }
        Returns: number
      }
      get_listing_inquiries: {
        Args: { p_listing_id: string }
        Returns: {
          created_at: string
          user_name: string
          user_phone: string
        }[]
      }
      get_or_create_collection_short_url: {
        Args: { p_alias: string; p_original_url: string; p_source?: string }
        Returns: string
      }
      get_owner_listing_inquiry_counts: {
        Args: never
        Returns: {
          inquiry_count: number
          listing_id: string
        }[]
      }
      get_sales_feature_enabled: { Args: never; Returns: boolean }
      get_user_permissions: {
        Args: { p_user_id: string }
        Returns: {
          can_feature_listings: boolean
          can_manage_agency: boolean
          can_post_sales: boolean
          is_admin: boolean
          is_banned: boolean
          max_featured_listings_per_user: number
        }[]
      }
      increment_article_views: {
        Args: { article_id: string }
        Returns: undefined
      }
      increment_listing_views: {
        Args: { listing_id: string }
        Returns: undefined
      }
      increment_short_url_clicks: {
        Args: { p_short_code: string }
        Returns: undefined
      }
      is_admin_cached: { Args: never; Returns: boolean }
      require_admin: { Args: never; Returns: undefined }
      rollup_analytics_events: { Args: never; Returns: undefined }
      search_locations: {
        Args: { search_query: string }
        Returns: {
          aliases: string[]
          bounds_east: number
          bounds_north: number
          bounds_south: number
          bounds_west: number
          center_lat: number
          center_lng: number
          id: string
          match_score: number
          name: string
          type: string
          zip_codes: string[]
        }[]
      }
      slugify: { Args: { input: string }; Returns: string }
      touch_session: {
        Args: {
          p_anon: string
          p_session: string
          p_ts: string
          p_user: string
        }
        Returns: undefined
      }
      trigger_daily_digest_if_time: { Args: never; Returns: undefined }
      user_can_post_sales: { Args: { user_id: string }; Returns: boolean }
    }
    Enums: {
      account_type: "agency" | "landlord"
      basement_type:
        | "finished"
        | "unfinished"
        | "partially_finished"
        | "walkout"
        | "none"
      billing_period: "monthly" | "yearly"
      contact_type: "agent" | "individual" | "unknown"
      cooling_type: "central_ac" | "split_units" | "window_units" | "none"
      delivery_condition:
        | "vacant_at_closing"
        | "subject_to_lease"
        | "negotiable"
      digest_sort_option:
        | "newest_first"
        | "price_asc"
        | "price_desc"
        | "featured_first"
      digest_template_category:
        | "marketing"
        | "internal"
        | "scheduled"
        | "one_time"
      digest_template_type:
        | "unsent_only"
        | "recent_by_category"
        | "filter_links"
        | "custom_query"
        | "mixed_layout"
        | "all_active"
      driveway_status: "private" | "easement" | "shared" | "carport" | "none"
      entitlement_source:
        | "purchase"
        | "subscription"
        | "admin_grant"
        | "promotional"
      feature_type: "one_time" | "subscription"
      footer_content_type: "rich_text" | "links"
      heat_type: "included" | "tenant_pays"
      heating_type:
        | "forced_air"
        | "radiator"
        | "baseboard"
        | "heat_pump"
        | "other"
      laundry_type: "in_unit" | "hookups_only" | "common_area" | "none"
      lease_length_type:
        | "short_term"
        | "long_term_annual"
        | "summer_rental"
        | "winter_rental"
      listing_payment_status: "unpaid" | "paid" | "subscription_credit" | "free"
      listing_type: "rental" | "sale"
      occupancy_status: "owner_occupied" | "tenant_occupied" | "vacant"
      parking_type: "yes" | "included" | "optional" | "no" | "carport"
      payment_status_type: "pending" | "succeeded" | "failed" | "refunded"
      property_condition: "excellent" | "good" | "fair" | "needs_work"
      property_type:
        | "apartment_building"
        | "apartment_house"
        | "full_house"
        | "duplex"
        | "basement"
        | "detached_house"
        | "semi_attached_house"
        | "fully_attached_townhouse"
        | "condo"
        | "co_op"
        | "single_family"
        | "two_family"
        | "three_family"
        | "four_family"
      rental_term_type: "long_term" | "short_term"
      sale_status: "available" | "pending" | "in_contract" | "sold"
      stripe_order_status: "pending" | "completed" | "canceled"
      stripe_subscription_status:
        | "not_started"
        | "incomplete"
        | "incomplete_expired"
        | "trialing"
        | "active"
        | "past_due"
        | "canceled"
        | "unpaid"
        | "paused"
      subscription_status:
        | "active"
        | "canceled"
        | "past_due"
        | "trialing"
        | "expired"
      transaction_type: "subscription" | "one_time" | "refund"
      user_role: "tenant" | "landlord" | "agent"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      account_type: ["agency", "landlord"],
      basement_type: [
        "finished",
        "unfinished",
        "partially_finished",
        "walkout",
        "none",
      ],
      billing_period: ["monthly", "yearly"],
      contact_type: ["agent", "individual", "unknown"],
      cooling_type: ["central_ac", "split_units", "window_units", "none"],
      delivery_condition: [
        "vacant_at_closing",
        "subject_to_lease",
        "negotiable",
      ],
      digest_sort_option: [
        "newest_first",
        "price_asc",
        "price_desc",
        "featured_first",
      ],
      digest_template_category: [
        "marketing",
        "internal",
        "scheduled",
        "one_time",
      ],
      digest_template_type: [
        "unsent_only",
        "recent_by_category",
        "filter_links",
        "custom_query",
        "mixed_layout",
        "all_active",
      ],
      driveway_status: ["private", "easement", "shared", "carport", "none"],
      entitlement_source: [
        "purchase",
        "subscription",
        "admin_grant",
        "promotional",
      ],
      feature_type: ["one_time", "subscription"],
      footer_content_type: ["rich_text", "links"],
      heat_type: ["included", "tenant_pays"],
      heating_type: [
        "forced_air",
        "radiator",
        "baseboard",
        "heat_pump",
        "other",
      ],
      laundry_type: ["in_unit", "hookups_only", "common_area", "none"],
      lease_length_type: [
        "short_term",
        "long_term_annual",
        "summer_rental",
        "winter_rental",
      ],
      listing_payment_status: ["unpaid", "paid", "subscription_credit", "free"],
      listing_type: ["rental", "sale"],
      occupancy_status: ["owner_occupied", "tenant_occupied", "vacant"],
      parking_type: ["yes", "included", "optional", "no", "carport"],
      payment_status_type: ["pending", "succeeded", "failed", "refunded"],
      property_condition: ["excellent", "good", "fair", "needs_work"],
      property_type: [
        "apartment_building",
        "apartment_house",
        "full_house",
        "duplex",
        "basement",
        "detached_house",
        "semi_attached_house",
        "fully_attached_townhouse",
        "condo",
        "co_op",
        "single_family",
        "two_family",
        "three_family",
        "four_family",
      ],
      rental_term_type: ["long_term", "short_term"],
      sale_status: ["available", "pending", "in_contract", "sold"],
      stripe_order_status: ["pending", "completed", "canceled"],
      stripe_subscription_status: [
        "not_started",
        "incomplete",
        "incomplete_expired",
        "trialing",
        "active",
        "past_due",
        "canceled",
        "unpaid",
        "paused",
      ],
      subscription_status: [
        "active",
        "canceled",
        "past_due",
        "trialing",
        "expired",
      ],
      transaction_type: ["subscription", "one_time", "refund"],
      user_role: ["tenant", "landlord", "agent"],
    },
  },
} as const
