/*
  # Help Center Content - Part 3

  Continuing population of help center articles:
  - For Agents & Landlords category (3 articles)
  - Safety & Trust category (2 articles)
*/

-- Insert Articles for For Agents & Landlords
INSERT INTO knowledge_base_articles (category_id, title, slug, excerpt, content, tags, sort_order, is_published, read_time_minutes)
SELECT
  id,
  'Agency page setup',
  'agency-page-setup',
  'Create your professional agency profile to showcase your brand',
  '<h2>Setting Up Your Agency Page</h2>
<p>A professional agency page helps build trust and attract more clients.</p>

<h3>Getting Started</h3>
<p>To create your agency page:</p>
<ol>
  <li>Navigate to Account Settings</li>
  <li>Select "Agency Settings"</li>
  <li>Click "Create Agency Page"</li>
  <li>Fill in your agency information</li>
  <li>Submit for review</li>
</ol>

<h3>Required Information</h3>
<p>You''ll need to provide:</p>
<ul>
  <li>Agency name</li>
  <li>Business registration number</li>
  <li>Office address</li>
  <li>Contact phone and email</li>
  <li>Business hours</li>
  <li>Website URL (if applicable)</li>
</ul>

<h3>Agency Profile Elements</h3>
<p><strong>Agency Logo:</strong></p>
<ul>
  <li>Recommended size: 400x400 pixels</li>
  <li>Format: PNG or JPG</li>
  <li>Should be clear and professional</li>
</ul>

<p><strong>Cover Photo:</strong></p>
<ul>
  <li>Recommended size: 1200x400 pixels</li>
  <li>Showcase your office or featured properties</li>
  <li>Maintain brand consistency</li>
</ul>

<p><strong>About Section:</strong></p>
<ul>
  <li>Company history and mission</li>
  <li>Areas served</li>
  <li>Specializations</li>
  <li>Team size and experience</li>
  <li>Awards or certifications</li>
</ul>

<p><strong>Services Offered:</strong></p>
<ul>
  <li>Property management</li>
  <li>Tenant placement</li>
  <li>Maintenance services</li>
  <li>Rental consulting</li>
</ul>

<h3>Verification Process</h3>
<p>To build trust, we verify all agency accounts:</p>
<ol>
  <li>Submit business documentation</li>
  <li>Our team reviews within 2-3 business days</li>
  <li>You receive verification badge</li>
  <li>Agency page goes live</li>
</ol>

<h3>Page Features</h3>
<p>Your agency page includes:</p>
<ul>
  <li>All your active listings in one place</li>
  <li>Contact form for inquiries</li>
  <li>Client reviews and ratings</li>
  <li>Social media links</li>
  <li>Custom URL (yoursite.com/agency/your-name)</li>
</ul>

<h3>Best Practices</h3>
<ul>
  <li>Keep information current</li>
  <li>Respond to reviews professionally</li>
  <li>Update photos seasonally</li>
  <li>Showcase your best properties</li>
  <li>Highlight positive client testimonials</li>
</ul>

<h3>Analytics</h3>
<p>Track your agency page performance:</p>
<ul>
  <li>Page views and visitor demographics</li>
  <li>Inquiry rates</li>
  <li>Most viewed listings</li>
  <li>Conversion metrics</li>
</ul>',
  ARRAY['agency', 'setup', 'profile', 'landlords'],
  1,
  true,
  5
FROM knowledge_base_categories WHERE slug = 'for-agents-landlords';

INSERT INTO knowledge_base_articles (category_id, title, slug, excerpt, content, tags, sort_order, is_published, read_time_minutes)
SELECT
  id,
  'Branding your profile',
  'branding-your-profile',
  'Customize your agency''s appearance to stand out from the competition',
  '<h2>Branding Your Profile</h2>
<p>Strong branding helps your agency stand out and creates a memorable impression.</p>

<h3>Visual Branding</h3>
<p><strong>Color Scheme:</strong></p>
<ul>
  <li>Choose 2-3 brand colors</li>
  <li>Apply consistently across all materials</li>
  <li>Ensure good contrast for readability</li>
  <li>Match your existing brand guidelines</li>
</ul>

<p><strong>Logo Usage:</strong></p>
<ul>
  <li>Use high-resolution versions</li>
  <li>Maintain proper spacing</li>
  <li>Include on all listings</li>
  <li>Add to email signatures</li>
</ul>

<p><strong>Photography Style:</strong></p>
<ul>
  <li>Consistent editing and filters</li>
  <li>Professional quality across all properties</li>
  <li>Similar composition and framing</li>
  <li>Watermark with your logo</li>
</ul>

<h3>Written Brand Voice</h3>
<p>Develop a consistent communication style:</p>

<p><strong>Professional and Formal:</strong></p>
<ul>
  <li>Best for luxury properties</li>
  <li>Corporate clients</li>
  <li>High-end market segments</li>
</ul>

<p><strong>Friendly and Approachable:</strong></p>
<ul>
  <li>Student housing</li>
  <li>First-time renters</li>
  <li>Family-oriented properties</li>
</ul>

<p><strong>Modern and Trendy:</strong></p>
<ul>
  <li>Young professionals</li>
  <li>Urban locations</li>
  <li>Contemporary properties</li>
</ul>

<h3>Custom Page Elements</h3>
<p>Agency accounts can customize:</p>
<ul>
  <li>Page layout and sections</li>
  <li>Featured properties carousel</li>
  <li>Testimonials display</li>
  <li>Custom call-to-action buttons</li>
  <li>Footer information</li>
</ul>

<h3>Marketing Materials</h3>
<p>Create branded materials for:</p>
<ul>
  <li>Property flyers</li>
  <li>Email templates</li>
  <li>Social media posts</li>
  <li>Digital brochures</li>
</ul>

<h3>Brand Consistency Checklist</h3>
<ul>
  <li>✓ Logo appears on all listings</li>
  <li>✓ Colors match across platform and website</li>
  <li>✓ All photos meet quality standards</li>
  <li>✓ Communication tone is consistent</li>
  <li>✓ Contact information is uniform</li>
  <li>✓ Social media links are current</li>
</ul>

<h3>Professional Tips</h3>
<ul>
  <li>Study successful agencies in your area</li>
  <li>Survey clients about your brand perception</li>
  <li>Update branding seasonally while maintaining core identity</li>
  <li>Train all team members on brand guidelines</li>
  <li>Monitor competitor branding strategies</li>
</ul>

<h3>Measuring Brand Impact</h3>
<p>Track how branding affects performance:</p>
<ul>
  <li>Recognition rates in your market</li>
  <li>Direct traffic to your agency page</li>
  <li>Repeat client rates</li>
  <li>Referral sources</li>
  <li>Social media engagement</li>
</ul>',
  ARRAY['branding', 'customization', 'agency', 'marketing'],
  2,
  true,
  5
FROM knowledge_base_categories WHERE slug = 'for-agents-landlords';

INSERT INTO knowledge_base_articles (category_id, title, slug, excerpt, content, tags, sort_order, is_published, read_time_minutes)
SELECT
  id,
  'Managing multiple listings',
  'managing-multiple-listings',
  'Efficiently handle multiple properties with our professional tools',
  '<h2>Managing Multiple Listings</h2>
<p>Streamline your workflow when managing numerous properties simultaneously.</p>

<h3>Dashboard Overview</h3>
<p>Your agency dashboard provides:</p>
<ul>
  <li>At-a-glance view of all listings</li>
  <li>Status indicators (active, pending, expired)</li>
  <li>Quick action buttons</li>
  <li>Performance metrics</li>
  <li>Recent inquiries</li>
</ul>

<h3>Bulk Operations</h3>
<p>Save time with bulk tools:</p>

<p><strong>Bulk Upload:</strong></p>
<ol>
  <li>Prepare CSV file with listing data</li>
  <li>Click "Bulk Upload" in dashboard</li>
  <li>Map fields to platform requirements</li>
  <li>Review and confirm</li>
  <li>Listings are created automatically</li>
</ol>

<p><strong>Bulk Edit:</strong></p>
<ul>
  <li>Select multiple listings</li>
  <li>Choose "Edit Selected"</li>
  <li>Update common fields at once</li>
  <li>Apply changes to all</li>
</ul>

<p><strong>Bulk Renewal:</strong></p>
<ul>
  <li>Renew multiple expiring listings</li>
  <li>Set new expiration dates</li>
  <li>Update pricing across portfolio</li>
</ul>

<h3>Organization Systems</h3>
<p><strong>Categories and Tags:</strong></p>
<ul>
  <li>Create custom categories (by neighborhood, type, etc.)</li>
  <li>Add tags for quick filtering</li>
  <li>Use status labels</li>
  <li>Color-code by priority</li>
</ul>

<p><strong>Saved Views:</strong></p>
<ul>
  <li>Create filtered views for different property types</li>
  <li>Save common searches</li>
  <li>Quick-switch between portfolios</li>
</ul>

<h3>Inquiry Management</h3>
<p>Handle multiple inquiries efficiently:</p>
<ul>
  <li>Unified inbox for all properties</li>
  <li>Auto-responses for common questions</li>
  <li>Template messages</li>
  <li>Priority flagging</li>
  <li>Assign inquiries to team members</li>
</ul>

<h3>Team Collaboration</h3>
<p>For agencies with multiple team members:</p>
<ul>
  <li>Assign listings to specific agents</li>
  <li>Set permissions and access levels</li>
  <li>Share internal notes</li>
  <li>Track who made what changes</li>
  <li>Coordinate showings via shared calendar</li>
</ul>

<h3>Automated Workflows</h3>
<p>Set up automation for:</p>
<ul>
  <li>Listing expiration reminders</li>
  <li>Price drop notifications</li>
  <li>Inquiry auto-responses</li>
  <li>Follow-up sequences</li>
  <li>Performance reports</li>
</ul>

<h3>Reporting and Analytics</h3>
<p>Track portfolio performance:</p>
<ul>
  <li>Views per listing</li>
  <li>Inquiry rates</li>
  <li>Average time to rent</li>
  <li>Conversion rates</li>
  <li>Revenue tracking</li>
  <li>Market comparison</li>
</ul>

<h3>Best Practices</h3>
<ul>
  <li>Set aside time daily for listing maintenance</li>
  <li>Use templates for consistent quality</li>
  <li>Respond to inquiries within 2 hours</li>
  <li>Review analytics weekly</li>
  <li>Keep notes on each property</li>
  <li>Document special requirements</li>
</ul>

<h3>Mobile Management</h3>
<p>Manage on-the-go:</p>
<ul>
  <li>Mobile-optimized dashboard</li>
  <li>Respond to inquiries anywhere</li>
  <li>Quick edits from your phone</li>
  <li>Upload photos directly from property visits</li>
</ul>',
  ARRAY['management', 'multiple-listings', 'efficiency', 'tools'],
  3,
  true,
  6
FROM knowledge_base_categories WHERE slug = 'for-agents-landlords';

-- Insert Articles for Safety & Trust
INSERT INTO knowledge_base_articles (category_id, title, slug, excerpt, content, tags, sort_order, is_published, read_time_minutes)
SELECT
  id,
  'Avoiding scams',
  'avoiding-scams',
  'Protect yourself from fraudulent activities while searching for housing',
  '<h2>Avoiding Scams</h2>
<p>Stay safe by recognizing and avoiding common rental scams.</p>

<h3>Common Scam Warning Signs</h3>
<p><strong>Too Good to Be True:</strong></p>
<ul>
  <li>Price significantly below market rate</li>
  <li>Luxury property at budget price</li>
  <li>No application process required</li>
  <li>Immediate approval promised</li>
</ul>

<p><strong>Payment Red Flags:</strong></p>
<ul>
  <li>Request for payment before viewing</li>
  <li>Wire transfer or gift card payments</li>
  <li>Pressure to "act fast" or "secure the property"</li>
  <li>Large upfront deposits</li>
  <li>Requests to use unusual payment methods</li>
</ul>

<p><strong>Communication Warning Signs:</strong></p>
<ul>
  <li>Landlord is "out of the country"</li>
  <li>Refuses phone calls or video chats</li>
  <li>Poor grammar and spelling</li>
  <li>Generic email addresses</li>
  <li>Evasive about property details</li>
</ul>

<h3>Common Scam Types</h3>
<p><strong>1. Fake Listings:</strong></p>
<ul>
  <li>Property doesn''t exist or isn''t for rent</li>
  <li>Photos stolen from other listings</li>
  <li>Scammer doesn''t have access to property</li>
</ul>

<p><strong>2. Bait and Switch:</strong></p>
<ul>
  <li>Property shown is different from listing</li>
  <li>Terms change after deposit is paid</li>
  <li>Additional fees appear unexpectedly</li>
</ul>

<p><strong>3. Identity Theft:</strong></p>
<ul>
  <li>Request for excessive personal information</li>
  <li>Fake application forms</li>
  <li>Requests for SSN before viewing</li>
</ul>

<h3>How to Protect Yourself</h3>
<p><strong>Before Viewing:</strong></p>
<ul>
  <li>Research the property address</li>
  <li>Verify listing on multiple platforms</li>
  <li>Check if price matches similar properties</li>
  <li>Use reverse image search on photos</li>
</ul>

<p><strong>During Viewing:</strong></p>
<ul>
  <li>Insist on in-person viewing</li>
  <li>Verify landlord identity</li>
  <li>Ask for proof of ownership</li>
  <li>Bring a friend if possible</li>
  <li>Trust your instincts</li>
</ul>

<p><strong>Before Paying:</strong></p>
<ul>
  <li>Read entire lease agreement</li>
  <li>Verify deposit requirements</li>
  <li>Use secure payment methods</li>
  <li>Get receipts for all payments</li>
  <li>Never wire money to strangers</li>
</ul>

<h3>Safe Payment Practices</h3>
<ul>
  <li>Use platform payment systems when available</li>
  <li>Pay by check or credit card (traceable)</li>
  <li>Avoid cash transactions</li>
  <li>Never send money before viewing</li>
  <li>Document all financial transactions</li>
</ul>

<h3>Legitimate Landlord Expectations</h3>
<p>Real landlords will:</p>
<ul>
  <li>Allow property viewings</li>
  <li>Provide verifiable contact information</li>
  <li>Have proper documentation</li>
  <li>Follow standard rental procedures</li>
  <li>Answer questions openly</li>
</ul>

<h3>What to Do If Scammed</h3>
<ol>
  <li>Stop all communication with scammer</li>
  <li>Document everything (emails, messages, payments)</li>
  <li>Report to local police</li>
  <li>Report listing on our platform</li>
  <li>Contact your bank if you sent money</li>
  <li>File report with FTC (fraud.ftc.gov)</li>
</ol>

<h3>Our Safety Measures</h3>
<p>We protect our community by:</p>
<ul>
  <li>Verifying agency accounts</li>
  <li>Reviewing all listings</li>
  <li>Monitoring for suspicious activity</li>
  <li>Removing fraudulent content</li>
  <li>Providing secure messaging</li>
</ul>

<p><strong>Remember:</strong> If something feels wrong, trust your instincts. It''s better to walk away than risk being scammed.</p>',
  ARRAY['scams', 'safety', 'fraud', 'protection'],
  1,
  true,
  6
FROM knowledge_base_categories WHERE slug = 'safety-trust';

INSERT INTO knowledge_base_articles (category_id, title, slug, excerpt, content, tags, sort_order, is_published, read_time_minutes)
SELECT
  id,
  'Reporting listings',
  'reporting-listings',
  'Help keep our community safe by reporting problematic content',
  '<h2>Reporting Listings</h2>
<p>Your vigilance helps maintain a trustworthy platform for everyone.</p>

<h3>When to Report</h3>
<p><strong>Fraudulent Listings:</strong></p>
<ul>
  <li>Suspected scams or fake properties</li>
  <li>Stolen or misleading photos</li>
  <li>Properties that don''t exist</li>
  <li>Unrealistic prices or terms</li>
  <li>Duplicate listings</li>
</ul>

<p><strong>Inappropriate Content:</strong></p>
<ul>
  <li>Discriminatory language</li>
  <li>Offensive or explicit images</li>
  <li>Misleading descriptions</li>
  <li>Spam or unrelated content</li>
  <li>Violations of fair housing laws</li>
</ul>

<p><strong>Incorrect Information:</strong></p>
<ul>
  <li>Wrong address or location</li>
  <li>Inaccurate property details</li>
  <li>False availability</li>
  <li>Misrepresented amenities</li>
</ul>

<h3>How to Report</h3>
<p><strong>Step-by-Step:</strong></p>
<ol>
  <li>Navigate to the suspicious listing</li>
  <li>Click the "Report" button (flag icon)</li>
  <li>Select the most relevant category</li>
  <li>Provide detailed explanation</li>
  <li>Include supporting evidence if available</li>
  <li>Submit report</li>
</ol>

<h3>Report Categories</h3>
<p>Choose the appropriate category:</p>
<ul>
  <li><strong>Scam or Fraud:</strong> Intentionally deceptive listings</li>
  <li><strong>Inappropriate Content:</strong> Offensive or discriminatory material</li>
  <li><strong>Incorrect Information:</strong> Honest mistakes or outdated info</li>
  <li><strong>Duplicate Listing:</strong> Same property posted multiple times</li>
  <li><strong>Property Not Available:</strong> Already rented but still listed</li>
  <li><strong>Spam:</strong> Unrelated or promotional content</li>
  <li><strong>Other:</strong> Issues not covered above</li>
</ul>

<h3>What Information to Include</h3>
<p>Help us investigate by providing:</p>
<ul>
  <li>Specific reason for report</li>
  <li>Details about the problem</li>
  <li>Screenshots if applicable</li>
  <li>Relevant dates and times</li>
  <li>Links to evidence (similar listings, actual property info)</li>
  <li>Your interactions with the landlord (if any)</li>
</ul>

<h3>Review Process</h3>
<p>After you report a listing:</p>
<ol>
  <li><strong>Immediate:</strong> Report is logged</li>
  <li><strong>Within 24 hours:</strong> Review team assesses the report</li>
  <li><strong>Investigation:</strong> We may contact reporter or listing owner</li>
  <li><strong>Action Taken:</strong> Warning, suspension, or removal</li>
  <li><strong>Follow-up:</strong> You receive email confirmation</li>
</ol>

<h3>Types of Actions</h3>
<p>Based on severity:</p>
<ul>
  <li><strong>Warning:</strong> Minor issues, first offense</li>
  <li><strong>Listing Removal:</strong> Policy violations</li>
  <li><strong>Temporary Suspension:</strong> Repeat violations</li>
  <li><strong>Permanent Ban:</strong> Fraud or serious violations</li>
  <li><strong>Legal Referral:</strong> Criminal activity</li>
</ul>

<h3>Anonymous Reporting</h3>
<p>Your privacy is protected:</p>
<ul>
  <li>Reports are confidential</li>
  <li>Listing owner won''t see your identity</li>
  <li>Exception: if legal action requires disclosure</li>
</ul>

<h3>False Reporting</h3>
<p>Please report only genuine issues:</p>
<ul>
  <li>False reports waste resources</li>
  <li>Malicious reporting may result in account restrictions</li>
  <li>Repeated false reports can lead to suspension</li>
</ul>

<h3>After Reporting</h3>
<p>While we investigate:</p>
<ul>
  <li>Avoid further interaction with suspicious listing</li>
  <li>Don''t send money or personal information</li>
  <li>Save all communication records</li>
  <li>Check your email for updates</li>
</ul>

<h3>Quick Report Checklist</h3>
<p>Before submitting:</p>
<ul>
  <li>✓ Selected correct category</li>
  <li>✓ Provided clear description</li>
  <li>✓ Included evidence if available</li>
  <li>✓ Double-checked details</li>
  <li>✓ Reviewed submission</li>
</ul>

<h3>Need Additional Help?</h3>
<p>For urgent safety concerns or if you''ve been a victim of fraud, contact our support team directly at support@example.com or call our safety hotline.</p>',
  ARRAY['reporting', 'moderation', 'safety', 'community'],
  2,
  true,
  5
FROM knowledge_base_categories WHERE slug = 'safety-trust';