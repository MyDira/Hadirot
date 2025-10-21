/*
  # Create Knowledge Base System

  1. New Tables
    - `knowledge_base_categories`
      - `id` (uuid, primary key)
      - `name` (text, category display name)
      - `slug` (text, URL-friendly identifier, unique)
      - `description` (text, category description)
      - `icon` (text, lucide-react icon name)
      - `sort_order` (integer, for ordering categories)
      - `is_active` (boolean, visibility toggle)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `knowledge_base_articles`
      - `id` (uuid, primary key)
      - `category_id` (uuid, foreign key to categories)
      - `title` (text, article title)
      - `slug` (text, URL-friendly identifier, unique)
      - `excerpt` (text, short summary)
      - `content` (text, full article HTML content)
      - `tags` (text[], array of searchable tags)
      - `view_count` (integer, tracking views)
      - `helpful_count` (integer, positive feedback count)
      - `not_helpful_count` (integer, negative feedback count)
      - `sort_order` (integer, order within category)
      - `is_published` (boolean, publication status)
      - `read_time_minutes` (integer, estimated read time)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `knowledge_base_feedback`
      - `id` (uuid, primary key)
      - `article_id` (uuid, foreign key to articles)
      - `user_id` (uuid, optional, foreign key to auth.users)
      - `is_helpful` (boolean, thumbs up/down)
      - `feedback_text` (text, optional detailed feedback)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Public read access to published articles and active categories
    - Admin-only write access to categories and articles
    - Any authenticated user can submit feedback

  3. Indexes
    - Index on category slug for fast lookups
    - Index on article slug for fast lookups
    - Index on category_id for efficient article queries
    - Index on tags for tag-based searches
*/

-- Create categories table
CREATE TABLE IF NOT EXISTS knowledge_base_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  description text NOT NULL,
  icon text NOT NULL DEFAULT 'HelpCircle',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create articles table
CREATE TABLE IF NOT EXISTS knowledge_base_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES knowledge_base_categories(id) ON DELETE CASCADE,
  title text NOT NULL,
  slug text UNIQUE NOT NULL,
  excerpt text NOT NULL,
  content text NOT NULL,
  tags text[] DEFAULT ARRAY[]::text[],
  view_count integer NOT NULL DEFAULT 0,
  helpful_count integer NOT NULL DEFAULT 0,
  not_helpful_count integer NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT false,
  read_time_minutes integer NOT NULL DEFAULT 5,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create feedback table
CREATE TABLE IF NOT EXISTS knowledge_base_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL REFERENCES knowledge_base_articles(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_helpful boolean NOT NULL,
  feedback_text text,
  created_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_kb_categories_slug ON knowledge_base_categories(slug);
CREATE INDEX IF NOT EXISTS idx_kb_articles_slug ON knowledge_base_articles(slug);
CREATE INDEX IF NOT EXISTS idx_kb_articles_category ON knowledge_base_articles(category_id);
CREATE INDEX IF NOT EXISTS idx_kb_articles_tags ON knowledge_base_articles USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_kb_feedback_article ON knowledge_base_feedback(article_id);

-- Enable Row Level Security
ALTER TABLE knowledge_base_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_base_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_base_feedback ENABLE ROW LEVEL SECURITY;

-- Categories policies
CREATE POLICY "Anyone can view active categories"
  ON knowledge_base_categories FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can manage categories"
  ON knowledge_base_categories FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- Articles policies
CREATE POLICY "Anyone can view published articles"
  ON knowledge_base_articles FOR SELECT
  USING (is_published = true);

CREATE POLICY "Admins can view all articles"
  ON knowledge_base_articles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

CREATE POLICY "Admins can manage articles"
  ON knowledge_base_articles FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- Feedback policies
CREATE POLICY "Anyone can view feedback"
  ON knowledge_base_feedback FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can submit feedback"
  ON knowledge_base_feedback FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update their own feedback"
  ON knowledge_base_feedback FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Function to increment view count
CREATE OR REPLACE FUNCTION increment_article_views(article_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE knowledge_base_articles
  SET view_count = view_count + 1
  WHERE id = article_id;
END;
$$;

-- Function to update helpful counts
CREATE OR REPLACE FUNCTION update_article_helpful_counts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.is_helpful THEN
    UPDATE knowledge_base_articles
    SET helpful_count = helpful_count + 1
    WHERE id = NEW.article_id;
  ELSE
    UPDATE knowledge_base_articles
    SET not_helpful_count = not_helpful_count + 1
    WHERE id = NEW.article_id;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger to update helpful counts on feedback insert
CREATE TRIGGER update_helpful_counts_on_feedback
  AFTER INSERT ON knowledge_base_feedback
  FOR EACH ROW
  EXECUTE FUNCTION update_article_helpful_counts();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_kb_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Triggers for updated_at
CREATE TRIGGER update_categories_updated_at
  BEFORE UPDATE ON knowledge_base_categories
  FOR EACH ROW
  EXECUTE FUNCTION update_kb_updated_at();

CREATE TRIGGER update_articles_updated_at
  BEFORE UPDATE ON knowledge_base_articles
  FOR EACH ROW
  EXECUTE FUNCTION update_kb_updated_at();
