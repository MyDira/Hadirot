/*
  # Remove Payment System Tables and Functions

  This migration removes all payment-related tables from the database:
  
  1. Tables Removed
    - `listing_payments` - Tracks payments for individual listings
    - `payment_transactions` - Records all payment transactions
    - `subscription` - Stores subscription records
    - `subscription_plans` - Contains available subscription plans
    - `user_subscriptions` - Links users to their subscriptions
  
  2. Security
    - Removes all RLS policies associated with these tables
    - Drops all related triggers, functions, and indexes
  
  3. Notes
    - This operation will permanently delete all payment data
    - Foreign key constraints will be dropped automatically
    - Related sequences will be removed
*/

-- Drop tables in correct order (children first to avoid FK issues)
DROP TABLE IF EXISTS listing_payments CASCADE;
DROP TABLE IF EXISTS payment_transactions CASCADE;
DROP TABLE IF EXISTS user_subscriptions CASCADE;
DROP TABLE IF EXISTS subscription CASCADE;
DROP TABLE IF EXISTS subscription_plans CASCADE;
