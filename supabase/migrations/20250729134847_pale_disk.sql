/*
  # MyDyra Real Estate Platform Database Schema

  1. New Tables
    - `profiles` - User profiles with role-based information
    - `listings` - Property listings with comprehensive details
    - `listing_images` - Multiple images per listing with featured flag
    - `favorites` - User saved listings
    - `admin_settings` - Featured listing controls and quotas

  2. Security
    - Enable RLS on all tables
    - Add policies for role-based access control
    - Secure admin-only operations

  3. Features
    - User roles: tenant, landlord, agent
    - Featured listings system with admin controls
    - Image management with compression and featured selection
    - Favorites system for all users
*/

-- Create custom types
CREATE TYPE user_role AS ENUM ('tenant', 'landlord', 'agent');
CREATE TYPE property_type AS ENUM ('apartment_building', 'apartment_house', 'full_house');
CREATE TYPE parking_type AS ENUM ('yes', 'included', 'optional', 'no');
CREATE TYPE heat_type AS ENUM ('included', 'tenant_pays');

-- Profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  role user_role NOT NULL,
  phone text,
  agency text,
  is_admin boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Listings table
CREATE TABLE IF NOT EXISTS listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  description text,
  location text NOT NULL,
  bedrooms integer NOT NULL,
  bathrooms numeric(3,1) NOT NULL,
  floor integer,
  price integer NOT NULL,
  square_footage integer,
  parking parking_type DEFAULT 'no',
  washer_dryer boolean DEFAULT false,
  dishwasher boolean DEFAULT false,
  lease_length text,
  heat heat_type DEFAULT 'tenant_pays',
  property_type property_type NOT NULL,
  contact_name text NOT NULL,
  contact_phone text NOT NULL,
  is_featured boolean DEFAULT false,
  featured_until timestamptz,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Listing images table
CREATE TABLE IF NOT EXISTS listing_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid REFERENCES listings(id) ON DELETE CASCADE NOT NULL,
  image_url text NOT NULL,
  is_featured boolean DEFAULT false,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Favorites table
CREATE TABLE IF NOT EXISTS favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  listing_id uuid REFERENCES listings(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, listing_id)
);

-- Admin settings table
CREATE TABLE IF NOT EXISTS admin_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  max_featured_listings integer DEFAULT 10,
  featured_duration_days integer DEFAULT 30,
  updated_at timestamptz DEFAULT now()
);

-- Insert default admin settings
INSERT INTO admin_settings (max_featured_listings, featured_duration_days) 
VALUES (10, 30) ON CONFLICT DO NOTHING;

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE listing_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can read all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Listings policies
CREATE POLICY "Anyone can read active listings"
  ON listings FOR SELECT
  USING (is_active = true);

CREATE POLICY "Users can create listings"
  ON listings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own listings"
  ON listings FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all listings"
  ON listings FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- Listing images policies
CREATE POLICY "Anyone can read listing images"
  ON listing_images FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM listings 
      WHERE id = listing_id AND is_active = true
    )
  );

CREATE POLICY "Users can manage own listing images"
  ON listing_images FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM listings 
      WHERE id = listing_id AND user_id = auth.uid()
    )
  );

-- Favorites policies
CREATE POLICY "Users can manage own favorites"
  ON favorites FOR ALL
  TO authenticated
  USING (auth.uid() = user_id);

-- Admin settings policies
CREATE POLICY "Anyone can read admin settings"
  ON admin_settings FOR SELECT
  USING (true);

CREATE POLICY "Only admins can update settings"
  ON admin_settings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- Functions
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER listings_updated_at
  BEFORE UPDATE ON listings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();