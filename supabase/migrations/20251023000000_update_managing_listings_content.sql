/*
  # Update Managing Listings Help Center Articles

  Updates all three articles in the Managing Listings category with enhanced HTML structure
  and improved formatting while preserving all existing content.

  Articles updated:
  1. Editing, renewing, or deleting listings
  2. Adding photos and descriptions
  3. Featured listings (coming soon)

  Changes:
  - Enhanced HTML structure for better readability
  - Improved semantic markup and organization
  - Consistent heading hierarchy
  - All content preserved exactly as-is
*/

-- Update Article 1: Editing, renewing, or deleting listings
UPDATE knowledge_base_articles
SET content = '<h2>Managing Your Listings</h2>
<p>Keep your listings up-to-date and manage them throughout their lifecycle.</p>

<h3>Editing a Listing</h3>
<p>To update your listing information:</p>
<ol>
  <li>Go to your Dashboard</li>
  <li>Find the listing you want to edit</li>
  <li>Click the "Edit" button</li>
  <li>Make your changes</li>
  <li>Click "Save Changes"</li>
</ol>

<p><strong>What you can edit:</strong></p>
<ul>
  <li>Price and availability dates</li>
  <li>Description and amenities</li>
  <li>Photos (add, remove, or reorder)</li>
  <li>Contact information</li>
</ul>

<h3>Renewing a Listing</h3>
<p>Listings automatically expire after 60 days. To renew:</p>
<ol>
  <li>Navigate to your expired listings</li>
  <li>Click "Renew"</li>
  <li>Review and update information if needed</li>
  <li>Confirm renewal</li>
</ol>

<p>Renewed listings will be re-reviewed before going live again.</p>

<h3>Deleting a Listing</h3>
<p>If your property is no longer available:</p>
<ol>
  <li>Go to your Dashboard</li>
  <li>Find the listing</li>
  <li>Click "Delete"</li>
  <li>Confirm deletion</li>
</ol>

<p><strong>Important:</strong> Deleted listings cannot be recovered. Consider marking as "Rented" instead if you might relist it later.</p>

<h3>Best Practices</h3>
<ul>
  <li>Update availability dates promptly</li>
  <li>Refresh photos periodically</li>
  <li>Respond to inquiries quickly</li>
  <li>Keep pricing competitive</li>
</ul>',
  updated_at = now()
WHERE slug = 'editing-renewing-deleting-listings'
  AND category_id IN (SELECT id FROM knowledge_base_categories WHERE slug = 'managing-listings');

-- Update Article 2: Adding photos and descriptions
UPDATE knowledge_base_articles
SET content = '<h2>Creating Attractive Listings</h2>
<p>Quality photos and descriptions are essential for attracting potential tenants.</p>

<h3>Photo Guidelines</h3>
<p><strong>Technical Requirements:</strong></p>
<ul>
  <li>Minimum resolution: 1024x768 pixels</li>
  <li>Accepted formats: JPG, PNG</li>
  <li>Maximum file size: 5MB per photo</li>
  <li>Maximum photos: 20 per listing</li>
</ul>

<p><strong>What to Photograph:</strong></p>
<ul>
  <li>Living room and common areas</li>
  <li>All bedrooms</li>
  <li>Kitchen and appliances</li>
  <li>Bathrooms</li>
  <li>Outdoor spaces (if applicable)</li>
  <li>Special features or amenities</li>
  <li>Building exterior and entrance</li>
</ul>

<p><strong>Photography Tips:</strong></p>
<ul>
  <li>Use natural lighting when possible</li>
  <li>Clean and declutter spaces first</li>
  <li>Take photos from corners to show room size</li>
  <li>Keep the camera level</li>
  <li>Highlight unique features</li>
</ul>

<h3>Writing Effective Descriptions</h3>
<p><strong>What to Include:</strong></p>
<ul>
  <li>Key features (size, bedrooms, bathrooms)</li>
  <li>Recent upgrades or renovations</li>
  <li>Included utilities and amenities</li>
  <li>Neighborhood highlights</li>
  <li>Transportation access</li>
  <li>Nearby schools, shops, parks</li>
  <li>Parking availability</li>
  <li>Pet policy</li>
</ul>

<p><strong>Writing Tips:</strong></p>
<ul>
  <li>Be honest and accurate</li>
  <li>Use descriptive language</li>
  <li>Highlight unique selling points</li>
  <li>Keep it concise but informative</li>
  <li>Check spelling and grammar</li>
  <li>Avoid discriminatory language</li>
</ul>

<h3>Example Description Structure</h3>
<p><em>"Beautiful 2-bedroom apartment in the heart of [Neighborhood]. Features include modern kitchen with stainless steel appliances, in-unit washer/dryer, and private balcony. Walking distance to metro, shops, and restaurants. Rent includes water and trash. Cat-friendly building with secured entry and parking available."</em></p>',
  updated_at = now()
WHERE slug = 'adding-photos-descriptions'
  AND category_id IN (SELECT id FROM knowledge_base_categories WHERE slug = 'managing-listings');

-- Update Article 3: Featured listings (coming soon)
UPDATE knowledge_base_articles
SET content = '<h2>Featured Listings</h2>
<p>We''re excited to announce that featured listing options are coming soon to our platform!</p>

<h3>What Are Featured Listings?</h3>
<p>Featured listings are premium placements that give your property maximum visibility:</p>
<ul>
  <li>Priority placement in search results</li>
  <li>Homepage carousel exposure</li>
  <li>Highlighted badges and borders</li>
  <li>Increased views and inquiries</li>
</ul>

<h3>Planned Features</h3>
<p><strong>Multiple Tiers:</strong></p>
<ul>
  <li><strong>Bronze:</strong> 3-day feature period</li>
  <li><strong>Silver:</strong> 7-day feature period with priority support</li>
  <li><strong>Gold:</strong> 14-day feature with premium placement</li>
</ul>

<p><strong>Additional Benefits:</strong></p>
<ul>
  <li>Featured badge on your listing</li>
  <li>Social media promotion</li>
  <li>Email newsletter inclusion</li>
  <li>Detailed analytics</li>
</ul>

<h3>How It Will Work</h3>
<ol>
  <li>Select an active listing from your dashboard</li>
  <li>Choose your preferred feature tier</li>
  <li>Select feature duration and start date</li>
  <li>Complete payment</li>
  <li>Your listing goes featured immediately</li>
</ol>

<h3>Early Bird Benefits</h3>
<p>Sign up for our waitlist to receive:</p>
<ul>
  <li>Launch notifications</li>
  <li>Special introductory pricing</li>
  <li>First access to featured slots</li>
  <li>Bonus feature days</li>
</ul>

<h3>Stay Updated</h3>
<p>We''ll announce the official launch soon! Follow us on social media or check your email for updates. If you have questions or suggestions about featured listings, please contact our support team.</p>',
  updated_at = now()
WHERE slug = 'featured-listings'
  AND category_id IN (SELECT id FROM knowledge_base_categories WHERE slug = 'managing-listings');
