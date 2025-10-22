/*
  # Help Center Content - Part 2

  Continuing population of help center articles:
  - Managing Listings category (3 articles)
  - For Tenants category (3 articles)
*/

-- Insert Articles for Managing Listings
INSERT INTO knowledge_base_articles (category_id, title, slug, excerpt, content, tags, sort_order, is_published, read_time_minutes)
SELECT
  id,
  'Editing, renewing, or deleting listings',
  'editing-renewing-deleting-listings',
  'Manage your existing listings effectively with our comprehensive tools',
  '<h2>Managing Your Listings</h2>
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
  ARRAY['editing', 'renewing', 'deleting', 'management'],
  1,
  true,
  4
FROM knowledge_base_categories WHERE slug = 'managing-listings';

INSERT INTO knowledge_base_articles (category_id, title, slug, excerpt, content, tags, sort_order, is_published, read_time_minutes)
SELECT
  id,
  'Adding photos and descriptions',
  'adding-photos-descriptions',
  'Make your listing stand out with great photos and compelling descriptions',
  '<h2>Creating Attractive Listings</h2>
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
  ARRAY['photos', 'descriptions', 'listings', 'tips'],
  2,
  true,
  5
FROM knowledge_base_categories WHERE slug = 'managing-listings';

INSERT INTO knowledge_base_articles (category_id, title, slug, excerpt, content, tags, sort_order, is_published, read_time_minutes)
SELECT
  id,
  'Featured listings (coming soon)',
  'featured-listings',
  'Learn about our upcoming featured listing options to boost visibility',
  '<h2>Featured Listings</h2>
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
  ARRAY['featured', 'premium', 'coming-soon', 'promotion'],
  3,
  true,
  3
FROM knowledge_base_categories WHERE slug = 'managing-listings';

-- Insert Articles for For Tenants
INSERT INTO knowledge_base_articles (category_id, title, slug, excerpt, content, tags, sort_order, is_published, read_time_minutes)
SELECT
  id,
  'Saving and sharing listings',
  'saving-sharing-listings',
  'Keep track of properties you''re interested in and share them with others',
  '<h2>Saving and Sharing Listings</h2>
<p>Our platform makes it easy to organize your property search and collaborate with others.</p>

<h3>Saving Listings</h3>
<p>To save a listing for later:</p>
<ol>
  <li>Click the heart icon on any listing</li>
  <li>The listing is added to your Favorites</li>
  <li>Access saved listings from your dashboard</li>
</ol>

<p><strong>Benefits of Saving:</strong></p>
<ul>
  <li>Quick access to properties you like</li>
  <li>Get notified of price changes</li>
  <li>Receive alerts if listing status changes</li>
  <li>Compare saved properties side-by-side</li>
</ul>

<h3>Organizing Your Favorites</h3>
<p>Manage your saved listings:</p>
<ul>
  <li>Add personal notes to each listing</li>
  <li>Create custom tags or categories</li>
  <li>Sort by price, date saved, or location</li>
  <li>Remove listings you''re no longer interested in</li>
</ul>

<h3>Sharing Listings</h3>
<p>Share properties with roommates, family, or friends:</p>

<p><strong>Share via Link:</strong></p>
<ol>
  <li>Click the share icon on any listing</li>
  <li>Copy the unique link</li>
  <li>Send via email, text, or messaging app</li>
</ol>

<p><strong>Share via Email:</strong></p>
<ol>
  <li>Click the share icon</li>
  <li>Select "Email"</li>
  <li>Enter recipient addresses</li>
  <li>Add a personal message (optional)</li>
  <li>Click "Send"</li>
</ol>

<p><strong>Share on Social Media:</strong></p>
<ul>
  <li>Direct share to Facebook, Twitter, or WhatsApp</li>
  <li>Preview shows photo and key details</li>
  <li>Help friends find great properties too!</li>
</ul>

<h3>Collaborative Searching</h3>
<p>Looking for a place with roommates? Create a shared favorites list where everyone can add and comment on listings.</p>

<h3>Privacy Note</h3>
<p>Only you can see your saved listings unless you explicitly share them. Your search activity remains private.</p>',
  ARRAY['favorites', 'sharing', 'tenants', 'search'],
  1,
  true,
  4
FROM knowledge_base_categories WHERE slug = 'for-tenants';

INSERT INTO knowledge_base_articles (category_id, title, slug, excerpt, content, tags, sort_order, is_published, read_time_minutes)
SELECT
  id,
  'Contacting landlords',
  'contacting-landlords',
  'Best practices for reaching out to property owners and agents',
  '<h2>Contacting Landlords</h2>
<p>Making a great first impression is important when reaching out about a property.</p>

<h3>Before You Contact</h3>
<p>Prepare by:</p>
<ul>
  <li>Reading the entire listing carefully</li>
  <li>Noting key details (price, availability, requirements)</li>
  <li>Preparing your questions</li>
  <li>Having your information ready (move-in date, employment, references)</li>
</ul>

<h3>How to Contact</h3>
<p><strong>Through Our Platform:</strong></p>
<ol>
  <li>Click "Contact Landlord" on the listing</li>
  <li>Fill out the inquiry form</li>
  <li>Include relevant information about yourself</li>
  <li>Click "Send Message"</li>
</ol>

<p>Your message goes directly to the landlord''s email and platform inbox.</p>

<h3>What to Include in Your Message</h3>
<p>A good inquiry message includes:</p>
<ul>
  <li>Brief introduction (name, occupation)</li>
  <li>Desired move-in date</li>
  <li>Length of stay needed</li>
  <li>Number of occupants</li>
  <li>Pets (if applicable)</li>
  <li>Specific questions about the property</li>
  <li>Your availability for viewing</li>
</ul>

<h3>Message Template</h3>
<p><em>"Hi [Landlord Name],</em></p>
<p><em>I''m interested in your [property type] at [location]. I''m a [your occupation] looking to move in around [date] for [duration]. I have [number] occupants and [pet status].</em></p>
<p><em>I''d love to schedule a viewing. I''m available [days/times]. Could you also clarify [specific questions]?</em></p>
<p><em>Thank you, [Your Name]"</em></p>

<h3>Do''s and Don''ts</h3>
<p><strong>Do:</strong></p>
<ul>
  <li>Be polite and professional</li>
  <li>Respond promptly to replies</li>
  <li>Ask relevant questions</li>
  <li>Follow up if no response within 48 hours</li>
</ul>

<p><strong>Don''t:</strong></p>
<ul>
  <li>Send the same generic message to everyone</li>
  <li>Make lowball offers immediately</li>
  <li>Share excessive personal information upfront</li>
  <li>Be pushy or demanding</li>
</ul>

<h3>Response Time</h3>
<p>Most landlords respond within 24-48 hours. If you haven''t heard back after 3 days, it''s appropriate to send a polite follow-up.</p>

<h3>Safety Reminder</h3>
<p>Always use our platform''s messaging system for initial contact. This protects both parties and creates a record of communication.</p>',
  ARRAY['contact', 'messaging', 'landlords', 'communication'],
  2,
  true,
  5
FROM knowledge_base_categories WHERE slug = 'for-tenants';

INSERT INTO knowledge_base_articles (category_id, title, slug, excerpt, content, tags, sort_order, is_published, read_time_minutes)
SELECT
  id,
  'Reporting issues',
  'reporting-issues',
  'How to report problematic listings or users to help keep our community safe',
  '<h2>Reporting Issues</h2>
<p>Your help in maintaining a safe and trustworthy community is essential.</p>

<h3>What to Report</h3>
<p><strong>Suspicious Listings:</strong></p>
<ul>
  <li>Prices significantly below market rate</li>
  <li>Requests for payment before viewing</li>
  <li>Stolen or fake photos</li>
  <li>Properties that don''t exist</li>
  <li>Duplicate listings</li>
</ul>

<p><strong>Inappropriate Content:</strong></p>
<ul>
  <li>Discriminatory language</li>
  <li>Offensive images</li>
  <li>Spam or unrelated content</li>
  <li>Misleading information</li>
</ul>

<p><strong>Problematic Behavior:</strong></p>
<ul>
  <li>Harassment or threatening messages</li>
  <li>Scam attempts</li>
  <li>Request for wire transfers or unusual payments</li>
  <li>Pressure tactics</li>
</ul>

<h3>How to Report a Listing</h3>
<ol>
  <li>Navigate to the problematic listing</li>
  <li>Click the "Report" button (flag icon)</li>
  <li>Select the issue category</li>
  <li>Provide details and evidence</li>
  <li>Submit your report</li>
</ol>

<h3>How to Report a User</h3>
<ol>
  <li>Go to the user''s profile</li>
  <li>Click "Report User"</li>
  <li>Select the reason</li>
  <li>Include specific examples</li>
  <li>Submit the report</li>
</ol>

<h3>What Happens Next</h3>
<p>After you submit a report:</p>
<ol>
  <li>Our team reviews it within 24 hours</li>
  <li>We may contact you for additional information</li>
  <li>Appropriate action is taken (warning, suspension, or removal)</li>
  <li>You receive a confirmation email</li>
</ol>

<h3>Providing Evidence</h3>
<p>Helpful evidence includes:</p>
<ul>
  <li>Screenshots of messages or listings</li>
  <li>Specific dates and times</li>
  <li>Links to duplicate or fake content</li>
  <li>Description of what happened</li>
</ul>

<h3>Confidentiality</h3>
<p>Your report is confidential. The reported party will not know who filed the report unless you choose to identify yourself.</p>

<h3>False Reports</h3>
<p>Please only report genuine issues. Submitting false or malicious reports may result in account restrictions.</p>

<h3>Emergency Situations</h3>
<p>If you''re in immediate danger or have experienced a crime, contact local authorities first, then report to us.</p>',
  ARRAY['reporting', 'safety', 'issues', 'community'],
  3,
  true,
  4
FROM knowledge_base_categories WHERE slug = 'for-tenants';
