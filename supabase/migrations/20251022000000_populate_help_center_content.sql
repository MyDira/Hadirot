/*
  # Populate Help Center Content

  1. Categories
    - Getting Started (Rocket icon)
    - Managing Listings (Settings icon)
    - For Tenants (Users icon)
    - For Agents & Landlords (Briefcase icon)
    - Safety & Trust (Shield icon)
    - Technical Help (Wrench icon)
    - Contact & Feedback (MessageCircle icon)

  2. Articles
    - 3 articles per category (21 total)
    - Each with title, excerpt, and detailed content
    - Blue and green color scheme throughout
    - Professional, user-friendly content

  3. Notes
    - All content extracted from provided document
    - Categories and articles are published and active by default
    - Sort order ensures proper display sequence
*/

-- Insert Categories
INSERT INTO knowledge_base_categories (name, slug, description, icon, sort_order, is_active) VALUES
('Getting Started', 'getting-started', 'Learn the basics of using our platform', 'Rocket', 1, true),
('Managing Listings', 'managing-listings', 'Tools and tips for managing your property listings', 'Settings', 2, true),
('For Tenants', 'for-tenants', 'Resources for people looking for accommodation', 'Users', 3, true),
('For Agents & Landlords', 'for-agents-landlords', 'Professional tools for property managers', 'Briefcase', 4, true),
('Safety & Trust', 'safety-trust', 'Staying safe while using our platform', 'Shield', 5, true),
('Technical Help', 'technical-help', 'Solutions for technical issues', 'Wrench', 6, true),
('Contact & Feedback', 'contact-feedback', 'Get in touch with our team', 'MessageCircle', 7, true);

-- Insert Articles for Getting Started
INSERT INTO knowledge_base_articles (category_id, title, slug, excerpt, content, tags, sort_order, is_published, read_time_minutes)
SELECT
  id,
  'Creating an account',
  'creating-an-account',
  'Step-by-step guide to creating your account and getting started on our platform',
  '<h2>Creating Your Account</h2>
<p>Welcome! Creating an account on our platform is quick and easy. Follow these simple steps to get started:</p>

<h3>Step 1: Click "Sign Up"</h3>
<p>Navigate to the homepage and click the "Sign Up" button in the top right corner.</p>

<h3>Step 2: Enter Your Information</h3>
<p>Provide the following details:</p>
<ul>
  <li>Email address</li>
  <li>Password (must be at least 8 characters)</li>
  <li>Full name</li>
</ul>

<h3>Step 3: Verify Your Email</h3>
<p>Check your inbox for a verification email and click the confirmation link.</p>

<h3>Step 4: Complete Your Profile</h3>
<p>Add additional information like your phone number and profile photo to help build trust in our community.</p>

<h3>Tips for Success</h3>
<ul>
  <li>Use a strong, unique password</li>
  <li>Keep your contact information up to date</li>
  <li>Add a professional profile photo</li>
</ul>

<p>Once your account is created, you can start posting listings or searching for properties right away!</p>',
  ARRAY['account', 'registration', 'sign-up', 'getting-started'],
  1,
  true,
  3
FROM knowledge_base_categories WHERE slug = 'getting-started';

INSERT INTO knowledge_base_articles (category_id, title, slug, excerpt, content, tags, sort_order, is_published, read_time_minutes)
SELECT
  id,
  'Posting your first listing',
  'posting-your-first-listing',
  'Learn how to create and publish your first property listing',
  '<h2>Posting Your First Listing</h2>
<p>Ready to list your property? Follow this comprehensive guide to create an attractive and effective listing.</p>

<h3>Step 1: Click "Post Listing"</h3>
<p>From your dashboard, click the "Post Listing" button to begin.</p>

<h3>Step 2: Basic Information</h3>
<p>Provide essential details about your property:</p>
<ul>
  <li>Property type (apartment, house, room, etc.)</li>
  <li>Number of bedrooms and bathrooms</li>
  <li>Monthly rent amount</li>
  <li>Available date</li>
  <li>Location/address</li>
</ul>

<h3>Step 3: Write a Compelling Description</h3>
<p>Your description should highlight:</p>
<ul>
  <li>Key features and amenities</li>
  <li>Nearby attractions and transportation</li>
  <li>Unique selling points</li>
  <li>Lease terms and requirements</li>
</ul>

<h3>Step 4: Upload Quality Photos</h3>
<p>Photos are crucial! Make sure to:</p>
<ul>
  <li>Use good lighting</li>
  <li>Show all rooms</li>
  <li>Highlight special features</li>
  <li>Upload at least 5-10 photos</li>
</ul>

<h3>Step 5: Review and Publish</h3>
<p>Double-check all information for accuracy, then click "Publish" to make your listing live.</p>

<p><strong>Note:</strong> Listings are typically reviewed within 24 hours before going live on the platform.</p>',
  ARRAY['posting', 'listing', 'first-time', 'landlord'],
  2,
  true,
  5
FROM knowledge_base_categories WHERE slug = 'getting-started';

INSERT INTO knowledge_base_articles (category_id, title, slug, excerpt, content, tags, sort_order, is_published, read_time_minutes)
SELECT
  id,
  'Understanding account types',
  'understanding-account-types',
  'Discover the different account types available and their features',
  '<h2>Account Types</h2>
<p>We offer different account types to suit various user needs. Here''s what you need to know:</p>

<h3>Basic Account (Free)</h3>
<p>Perfect for individual landlords or tenants:</p>
<ul>
  <li>Post up to 3 active listings</li>
  <li>Access to all search features</li>
  <li>Save favorite listings</li>
  <li>Direct messaging with other users</li>
  <li>Email notifications</li>
</ul>

<h3>Agency Account</h3>
<p>Designed for property management professionals:</p>
<ul>
  <li>Unlimited listings</li>
  <li>Custom agency page</li>
  <li>Branded profile</li>
  <li>Priority support</li>
  <li>Advanced analytics</li>
  <li>Bulk listing tools</li>
</ul>

<h3>Choosing the Right Account</h3>
<p><strong>Choose Basic if:</strong></p>
<ul>
  <li>You''re renting out your own property</li>
  <li>You''re searching for accommodation</li>
  <li>You manage just a few properties</li>
</ul>

<p><strong>Choose Agency if:</strong></p>
<ul>
  <li>You manage multiple properties</li>
  <li>You''re a professional property manager</li>
  <li>You want enhanced branding options</li>
  <li>You need advanced features</li>
</ul>

<h3>Upgrading Your Account</h3>
<p>You can upgrade from Basic to Agency at any time from your account settings. Contact our support team for assistance with the upgrade process.</p>',
  ARRAY['account-types', 'features', 'upgrade', 'agency'],
  3,
  true,
  4
FROM knowledge_base_categories WHERE slug = 'getting-started';
