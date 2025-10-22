/*
  # Help Center Content - Part 4 (Final)

  Completing population of help center articles:
  - Safety & Trust category (1 remaining article)
  - Technical Help category (3 articles)
  - Contact & Feedback category (3 articles)
*/

-- Continue Safety & Trust category
INSERT INTO knowledge_base_articles (category_id, title, slug, excerpt, content, tags, sort_order, is_published, read_time_minutes)
SELECT
  id,
  'Privacy policy summary',
  'privacy-policy-summary',
  'Understanding how we protect your data and respect your privacy',
  '<h2>Privacy Policy Summary</h2>
<p>We take your privacy seriously. Here''s a summary of how we collect, use, and protect your information.</p>

<h3>Information We Collect</h3>
<p><strong>Account Information:</strong></p>
<ul>
  <li>Name and email address</li>
  <li>Phone number (optional)</li>
  <li>Profile photo (optional)</li>
  <li>Account preferences</li>
</ul>

<p><strong>Listing Information:</strong></p>
<ul>
  <li>Property details you post</li>
  <li>Photos and descriptions</li>
  <li>Contact preferences</li>
  <li>Pricing and availability</li>
</ul>

<p><strong>Usage Data:</strong></p>
<ul>
  <li>Pages visited</li>
  <li>Search queries</li>
  <li>Listing views</li>
  <li>Time spent on site</li>
  <li>Device and browser information</li>
</ul>

<p><strong>Communication Records:</strong></p>
<ul>
  <li>Messages between users</li>
  <li>Support inquiries</li>
  <li>Email correspondence</li>
</ul>

<h3>How We Use Your Information</h3>
<p><strong>Providing Services:</strong></p>
<ul>
  <li>Create and manage your account</li>
  <li>Display your listings</li>
  <li>Facilitate communication between users</li>
  <li>Process transactions</li>
  <li>Provide customer support</li>
</ul>

<p><strong>Improving Platform:</strong></p>
<ul>
  <li>Analyze usage patterns</li>
  <li>Develop new features</li>
  <li>Fix bugs and issues</li>
  <li>Enhance user experience</li>
</ul>

<p><strong>Safety and Security:</strong></p>
<ul>
  <li>Prevent fraud and abuse</li>
  <li>Enforce our terms of service</li>
  <li>Investigate violations</li>
  <li>Protect all users</li>
</ul>

<h3>Information Sharing</h3>
<p><strong>What''s Public:</strong></p>
<ul>
  <li>Listing information you choose to post</li>
  <li>Your public profile (name, photo, agency info)</li>
  <li>Reviews and ratings</li>
</ul>

<p><strong>What''s Private:</strong></p>
<ul>
  <li>Email address (not shown publicly)</li>
  <li>Phone number (shared only when you contact someone)</li>
  <li>Payment information</li>
  <li>Private messages</li>
  <li>Saved listings and searches</li>
</ul>

<p><strong>Third-Party Sharing:</strong></p>
<ul>
  <li>We do NOT sell your personal information</li>
  <li>Service providers (hosting, email, analytics) under strict agreements</li>
  <li>Legal requirements if mandated by law</li>
  <li>With your explicit consent</li>
</ul>

<h3>Your Privacy Rights</h3>
<p><strong>Access and Control:</strong></p>
<ul>
  <li>View all your personal data</li>
  <li>Edit or update information</li>
  <li>Download your data</li>
  <li>Delete your account</li>
</ul>

<p><strong>Communication Preferences:</strong></p>
<ul>
  <li>Choose email notification types</li>
  <li>Opt out of marketing emails</li>
  <li>Set message preferences</li>
  <li>Manage alerts</li>
</ul>

<p><strong>Privacy Settings:</strong></p>
<ul>
  <li>Control profile visibility</li>
  <li>Manage contact information sharing</li>
  <li>Set search privacy</li>
  <li>Configure activity visibility</li>
</ul>

<h3>Data Security</h3>
<p>We protect your information through:</p>
<ul>
  <li>Encrypted data transmission (SSL/TLS)</li>
  <li>Secure password hashing</li>
  <li>Regular security audits</li>
  <li>Limited employee access</li>
  <li>Secure data storage</li>
  <li>Automated backup systems</li>
</ul>

<h3>Cookies and Tracking</h3>
<p>We use cookies for:</p>
<ul>
  <li>Keeping you logged in</li>
  <li>Remembering preferences</li>
  <li>Analytics and improvements</li>
  <li>Preventing fraud</li>
</ul>

<p>You can control cookies through browser settings, but some features may not work without them.</p>

<h3>Data Retention</h3>
<ul>
  <li>Active account data: retained while account is active</li>
  <li>Deleted accounts: most data removed within 30 days</li>
  <li>Legal requirements: some data retained as required by law</li>
  <li>Inactive accounts: deleted after 2 years of inactivity</li>
</ul>

<h3>Children''s Privacy</h3>
<p>Our platform is not intended for users under 18. We do not knowingly collect information from minors.</p>

<h3>Changes to Privacy Policy</h3>
<p>We may update this policy:</p>
<ul>
  <li>Material changes announced via email</li>
  <li>Continued use implies acceptance</li>
  <li>Previous versions archived</li>
  <li>Last updated date displayed</li>
</ul>

<h3>Contact About Privacy</h3>
<p>Questions or concerns about privacy:</p>
<ul>
  <li>Email: privacy@example.com</li>
  <li>Review full policy: [link to complete privacy policy]</li>
  <li>Submit data request: [link to data request form]</li>
</ul>

<p><strong>Note:</strong> This is a summary. Please read our complete privacy policy for full details.</p>',
  ARRAY['privacy', 'data-protection', 'security', 'rights'],
  3,
  true,
  6
FROM knowledge_base_categories WHERE slug = 'safety-trust';

-- Insert Articles for Technical Help
INSERT INTO knowledge_base_articles (category_id, title, slug, excerpt, content, tags, sort_order, is_published, read_time_minutes)
SELECT
  id,
  'Troubleshooting login or upload issues',
  'troubleshooting-issues',
  'Resolve common technical problems with logging in or uploading content',
  '<h2>Troubleshooting Common Issues</h2>
<p>Quick solutions to the most common technical problems.</p>

<h3>Login Issues</h3>
<p><strong>Can''t Remember Password:</strong></p>
<ol>
  <li>Click "Forgot Password" on login page</li>
  <li>Enter your email address</li>
  <li>Check email for reset link</li>
  <li>Click link and create new password</li>
  <li>Password must be at least 8 characters</li>
</ol>

<p><strong>Not Receiving Reset Email:</strong></p>
<ul>
  <li>Check spam/junk folder</li>
  <li>Verify email address is correct</li>
  <li>Wait 10 minutes (delivery can be delayed)</li>
  <li>Try requesting another reset</li>
  <li>Contact support if still not received</li>
</ul>

<p><strong>Account Locked:</strong></p>
<ul>
  <li>Too many failed login attempts</li>
  <li>Wait 15 minutes and try again</li>
  <li>Use "Forgot Password" to reset</li>
  <li>Contact support if locked for other reasons</li>
</ul>

<p><strong>"Invalid Credentials" Error:</strong></p>
<ul>
  <li>Check for typos in email/password</li>
  <li>Ensure caps lock is off</li>
  <li>Try copying and pasting password</li>
  <li>Clear browser cache and try again</li>
  <li>Reset password if problems persist</li>
</ul>

<h3>Photo Upload Issues</h3>
<p><strong>Upload Failing:</strong></p>
<ul>
  <li>Check file size (must be under 5MB)</li>
  <li>Verify format (JPG or PNG only)</li>
  <li>Try a different photo</li>
  <li>Check internet connection</li>
  <li>Try different browser</li>
</ul>

<p><strong>Photos Not Appearing:</strong></p>
<ul>
  <li>Wait a few minutes for processing</li>
  <li>Refresh the page</li>
  <li>Clear browser cache</li>
  <li>Check if upload actually completed</li>
  <li>Try uploading again</li>
</ul>

<p><strong>Image Quality Issues:</strong></p>
<ul>
  <li>Upload higher resolution images</li>
  <li>Avoid excessive compression</li>
  <li>Minimum recommended: 1024x768 pixels</li>
  <li>Use original photos when possible</li>
</ul>

<h3>Page Loading Problems</h3>
<p><strong>Slow Loading:</strong></p>
<ul>
  <li>Check internet connection speed</li>
  <li>Close unnecessary browser tabs</li>
  <li>Disable browser extensions temporarily</li>
  <li>Try different time of day</li>
  <li>Clear browser cache</li>
</ul>

<p><strong>Page Won''t Load:</strong></p>
<ul>
  <li>Refresh the page (F5 or Cmd+R)</li>
  <li>Clear browser cache and cookies</li>
  <li>Try incognito/private browsing</li>
  <li>Check our status page for outages</li>
  <li>Try different browser</li>
</ul>

<h3>Search Not Working</h3>
<p>If search isn''t returning results:</p>
<ul>
  <li>Simplify search terms</li>
  <li>Remove filters and try again</li>
  <li>Check spelling</li>
  <li>Try broader location</li>
  <li>Clear search and start over</li>
</ul>

<h3>Messages Not Sending</h3>
<ul>
  <li>Check character limit (max 1000 characters)</li>
  <li>Verify recipient hasn''t blocked you</li>
  <li>Check internet connection</li>
  <li>Try refreshing page</li>
  <li>Clear draft and rewrite</li>
</ul>

<h3>General Troubleshooting Steps</h3>
<p>Try these in order:</p>
<ol>
  <li><strong>Refresh:</strong> Reload the page</li>
  <li><strong>Clear Cache:</strong> Clear browser cache and cookies</li>
  <li><strong>Restart Browser:</strong> Close and reopen your browser</li>
  <li><strong>Try Different Browser:</strong> Test in Chrome, Firefox, or Safari</li>
  <li><strong>Check Connection:</strong> Verify internet is working</li>
  <li><strong>Disable Extensions:</strong> Turn off ad blockers temporarily</li>
  <li><strong>Update Browser:</strong> Ensure you''re using latest version</li>
  <li><strong>Restart Device:</strong> Sometimes a simple restart helps</li>
</ol>

<h3>How to Clear Cache</h3>
<p><strong>Chrome:</strong></p>
<ol>
  <li>Press Ctrl+Shift+Delete (Cmd+Shift+Delete on Mac)</li>
  <li>Select "All time"</li>
  <li>Check "Cookies" and "Cached images"</li>
  <li>Click "Clear data"</li>
</ol>

<p><strong>Firefox:</strong></p>
<ol>
  <li>Press Ctrl+Shift+Delete</li>
  <li>Select "Everything"</li>
  <li>Check relevant boxes</li>
  <li>Click "Clear Now"</li>
</ol>

<p><strong>Safari:</strong></p>
<ol>
  <li>Safari menu > Preferences > Privacy</li>
  <li>Click "Manage Website Data"</li>
  <li>Click "Remove All"</li>
</ol>

<h3>Still Having Issues?</h3>
<p>Contact our support team with:</p>
<ul>
  <li>Description of the problem</li>
  <li>What you were trying to do</li>
  <li>Error messages (screenshot if possible)</li>
  <li>Browser and device information</li>
  <li>When the issue started</li>
</ul>

<p>Email: support@example.com</p>',
  ARRAY['troubleshooting', 'technical', 'help', 'issues'],
  1,
  true,
  6
FROM knowledge_base_categories WHERE slug = 'technical-help';

INSERT INTO knowledge_base_articles (category_id, title, slug, excerpt, content, tags, sort_order, is_published, read_time_minutes)
SELECT
  id,
  'Browser/device compatibility',
  'browser-device-compatibility',
  'Ensure your browser and device work optimally with our platform',
  '<h2>Browser and Device Compatibility</h2>
<p>Our platform works best with modern browsers and devices.</p>

<h3>Supported Browsers</h3>
<p><strong>Fully Supported (Recommended):</strong></p>
<ul>
  <li>Google Chrome (version 90+)</li>
  <li>Mozilla Firefox (version 88+)</li>
  <li>Safari (version 14+)</li>
  <li>Microsoft Edge (version 90+)</li>
</ul>

<p><strong>Limited Support:</strong></p>
<ul>
  <li>Older browser versions may work but with reduced functionality</li>
  <li>Internet Explorer is not supported</li>
</ul>

<h3>Browser Requirements</h3>
<p>Your browser must have:</p>
<ul>
  <li>JavaScript enabled</li>
  <li>Cookies enabled</li>
  <li>Local storage support</li>
  <li>CSS3 support</li>
</ul>

<h3>Checking Your Browser Version</h3>
<p><strong>Chrome:</strong></p>
<ol>
  <li>Click three dots (top right)</li>
  <li>Select Help > About Google Chrome</li>
  <li>Version number displays automatically</li>
</ol>

<p><strong>Firefox:</strong></p>
<ol>
  <li>Click hamburger menu (top right)</li>
  <li>Select Help > About Firefox</li>
  <li>Version shown in new window</li>
</ol>

<p><strong>Safari:</strong></p>
<ol>
  <li>Safari menu > About Safari</li>
  <li>Version shown in popup</li>
</ol>

<h3>Updating Your Browser</h3>
<p>Most browsers auto-update, but to manually update:</p>
<ul>
  <li><strong>Chrome:</strong> Settings > About Chrome > Updates automatically</li>
  <li><strong>Firefox:</strong> Menu > Help > About Firefox > Updates automatically</li>
  <li><strong>Safari:</strong> Updates with macOS/iOS updates</li>
  <li><strong>Edge:</strong> Settings > About > Updates automatically</li>
</ul>

<h3>Mobile Devices</h3>
<p><strong>iOS:</strong></p>
<ul>
  <li>iOS 13 or later</li>
  <li>Works in Safari, Chrome, Firefox</li>
  <li>Full functionality on iPhone and iPad</li>
</ul>

<p><strong>Android:</strong></p>
<ul>
  <li>Android 8.0 or later</li>
  <li>Works in Chrome, Firefox, Samsung Internet</li>
  <li>Optimized for all screen sizes</li>
</ul>

<h3>Desktop Requirements</h3>
<p><strong>Minimum Specifications:</strong></p>
<ul>
  <li>2 GB RAM</li>
  <li>Stable internet connection (1 Mbps+)</li>
  <li>Screen resolution: 1024x768 or higher</li>
  <li>Operating System: Windows 10, macOS 10.13, or Linux</li>
</ul>

<p><strong>Recommended:</strong></p>
<ul>
  <li>4 GB+ RAM</li>
  <li>Broadband internet (5 Mbps+)</li>
  <li>1920x1080 or higher resolution</li>
  <li>Latest OS version</li>
</ul>

<h3>Feature Compatibility</h3>
<p><strong>Photo Upload:</strong></p>
<ul>
  <li>All supported browsers</li>
  <li>Mobile camera access (with permission)</li>
  <li>Drag-and-drop on desktop</li>
</ul>

<p><strong>Messaging:</strong></p>
<ul>
  <li>Real-time on all platforms</li>
  <li>Notifications in supported browsers</li>
  <li>Mobile push notifications</li>
</ul>

<p><strong>Map Features:</strong></p>
<ul>
  <li>Interactive maps on all devices</li>
  <li>Location services (with permission)</li>
  <li>Geolocation for nearby search</li>
</ul>

<h3>Enabling Required Features</h3>
<p><strong>JavaScript:</strong></p>
<ul>
  <li>Usually enabled by default</li>
  <li>Check browser settings > Privacy/Security</li>
  <li>Look for "JavaScript" or "Content Settings"</li>
</ul>

<p><strong>Cookies:</strong></p>
<ul>
  <li>Required for login and preferences</li>
  <li>Settings > Privacy > Cookies</li>
  <li>Allow cookies for our domain</li>
</ul>

<p><strong>Location Services:</strong></p>
<ul>
  <li>Browser will prompt when needed</li>
  <li>Can be managed in browser settings</li>
  <li>Optional but improves search results</li>
</ul>

<h3>Known Issues</h3>
<p><strong>Ad Blockers:</strong></p>
<ul>
  <li>May interfere with images or maps</li>
  <li>Whitelist our site if you experience issues</li>
  <li>Disable temporarily to test</li>
</ul>

<p><strong>Privacy Extensions:</strong></p>
<ul>
  <li>Some extensions block necessary features</li>
  <li>Try disabling if problems occur</li>
  <li>Configure to allow our domain</li>
</ul>

<p><strong>VPN/Proxy:</strong></p>
<ul>
  <li>May cause slower loading</li>
  <li>Could affect location-based features</li>
  <li>Usually compatible but may need adjustment</li>
</ul>

<h3>Optimizing Performance</h3>
<p>For best experience:</p>
<ul>
  <li>Keep browser updated</li>
  <li>Close unnecessary tabs</li>
  <li>Clear cache regularly</li>
  <li>Disable unused extensions</li>
  <li>Use wired connection when possible</li>
  <li>Ensure adequate device resources</li>
</ul>

<h3>Accessibility Features</h3>
<p>We support:</p>
<ul>
  <li>Screen readers</li>
  <li>Keyboard navigation</li>
  <li>High contrast modes</li>
  <li>Text resizing</li>
  <li>Alt text for images</li>
</ul>

<h3>Need Help?</h3>
<p>If you''re experiencing compatibility issues:</p>
<ul>
  <li>Try a different browser</li>
  <li>Update to latest version</li>
  <li>Check our troubleshooting guide</li>
  <li>Contact support with device/browser details</li>
</ul>',
  ARRAY['compatibility', 'browsers', 'devices', 'technical'],
  2,
  true,
  5
FROM knowledge_base_categories WHERE slug = 'technical-help';

INSERT INTO knowledge_base_articles (category_id, title, slug, excerpt, content, tags, sort_order, is_published, read_time_minutes)
SELECT
  id,
  'Email notifications',
  'email-notifications',
  'Manage your notification preferences and email settings',
  '<h2>Email Notifications</h2>
<p>Stay informed with customizable email notifications.</p>

<h3>Types of Notifications</h3>
<p><strong>Account Activity:</strong></p>
<ul>
  <li>Login from new device</li>
  <li>Password changes</li>
  <li>Email address updates</li>
  <li>Account security alerts</li>
</ul>

<p><strong>Listing Updates:</strong></p>
<ul>
  <li>Listing approved/rejected</li>
  <li>Listing about to expire</li>
  <li>Price change confirmations</li>
  <li>Photo upload confirmations</li>
</ul>

<p><strong>Messages and Inquiries:</strong></p>
<ul>
  <li>New message received</li>
  <li>Inquiry about your listing</li>
  <li>Response to your inquiry</li>
  <li>Missed message alerts</li>
</ul>

<p><strong>Favorites and Saved Searches:</strong></p>
<ul>
  <li>Price drop on saved listing</li>
  <li>Saved listing updated</li>
  <li>New listings match your search</li>
  <li>Saved listing about to expire</li>
</ul>

<p><strong>Platform Updates:</strong></p>
<ul>
  <li>New features announcements</li>
  <li>Policy changes</li>
  <li>Tips and best practices</li>
  <li>Newsletter (optional)</li>
</ul>

<h3>Managing Notification Settings</h3>
<p><strong>To adjust settings:</strong></p>
<ol>
  <li>Log into your account</li>
  <li>Click profile icon > Settings</li>
  <li>Select "Notifications"</li>
  <li>Toggle preferences on/off</li>
  <li>Save changes</li>
</ol>

<h3>Notification Frequency</h3>
<p>Choose how often you receive emails:</p>
<ul>
  <li><strong>Instant:</strong> Immediate notification for each event</li>
  <li><strong>Daily Digest:</strong> One email per day with all updates</li>
  <li><strong>Weekly Summary:</strong> Weekly roundup of activity</li>
  <li><strong>Off:</strong> No notifications for this category</li>
</ul>

<h3>Recommended Settings</h3>
<p><strong>For Landlords:</strong></p>
<ul>
  <li>Instant: New inquiries</li>
  <li>Instant: Messages</li>
  <li>Daily: Listing views/saves</li>
  <li>Weekly: Performance summaries</li>
</ul>

<p><strong>For Tenants:</strong></p>
<ul>
  <li>Instant: Replies to inquiries</li>
  <li>Daily: New matching listings</li>
  <li>Daily: Saved listing updates</li>
  <li>Off: Platform updates (unless interested)</li>
</ul>

<p><strong>For Agencies:</strong></p>
<ul>
  <li>Instant: All inquiries and messages</li>
  <li>Daily: Performance metrics</li>
  <li>Weekly: Analytics reports</li>
  <li>Monthly: Billing and statements</li>
</ul>

<h3>Email Not Arriving?</h3>
<p><strong>Check Spam Folder:</strong></p>
<ul>
  <li>Look in spam/junk</li>
  <li>Mark our emails as "Not Spam"</li>
  <li>Add our email to contacts</li>
</ul>

<p><strong>Verify Email Address:</strong></p>
<ul>
  <li>Check Settings > Account</li>
  <li>Ensure email is correct</li>
  <li>Update if necessary</li>
  <li>Verify new address</li>
</ul>

<p><strong>Check Filters:</strong></p>
<ul>
  <li>Email filters may be redirecting</li>
  <li>Check email rules</li>
  <li>Look in other folders</li>
</ul>

<h3>Unsubscribing</h3>
<p>To stop specific emails:</p>
<ul>
  <li>Click "Unsubscribe" link in any email</li>
  <li>Or adjust settings in your account</li>
  <li>Changes take effect within 24 hours</li>
</ul>

<p><strong>Note:</strong> Critical emails (security, legal) cannot be unsubscribed.</p>

<h3>Whitelisting Our Emails</h3>
<p>Ensure delivery by adding to safe senders:</p>
<p><strong>Our email addresses:</strong></p>
<ul>
  <li>noreply@example.com</li>
  <li>notifications@example.com</li>
  <li>support@example.com</li>
</ul>

<p><strong>Gmail:</strong></p>
<ol>
  <li>Open an email from us</li>
  <li>Click three dots > "Add to contacts"</li>
  <li>Confirm addition</li>
</ol>

<p><strong>Outlook:</strong></p>
<ol>
  <li>Settings > Mail > Junk email</li>
  <li>Safe senders and domains</li>
  <li>Add our domain</li>
</ol>

<h3>Email Preferences Tips</h3>
<ul>
  <li>Start with defaults, adjust as needed</li>
  <li>Use digest options to reduce volume</li>
  <li>Keep security notifications on</li>
  <li>Unsubscribe from irrelevant updates</li>
  <li>Check spam folder regularly initially</li>
</ul>

<h3>Mobile Push Notifications</h3>
<p>If using our mobile site:</p>
<ul>
  <li>Allow browser notifications</li>
  <li>Manage in browser settings</li>
  <li>Separate from email preferences</li>
  <li>Can be disabled anytime</li>
</ul>

<h3>Notification Content</h3>
<p>Our emails include:</p>
<ul>
  <li>Clear subject lines</li>
  <li>Relevant details</li>
  <li>Direct links to take action</li>
  <li>Unsubscribe option</li>
  <li>Contact information</li>
</ul>

<h3>Privacy and Notifications</h3>
<ul>
  <li>We never share your email</li>
  <li>No third-party marketing emails</li>
  <li>Your preferences are respected</li>
  <li>Emails come only from our domain</li>
</ul>

<h3>Troubleshooting</h3>
<p>If notifications aren''t working correctly:</p>
<ol>
  <li>Verify email address in settings</li>
  <li>Check spam/junk folders</li>
  <li>Review notification preferences</li>
  <li>Whitelist our email addresses</li>
  <li>Wait 24 hours for changes to apply</li>
  <li>Contact support if issues persist</li>
</ol>',
  ARRAY['notifications', 'email', 'preferences', 'settings'],
  3,
  true,
  5
FROM knowledge_base_categories WHERE slug = 'technical-help';

-- Insert Articles for Contact & Feedback (Final 3 articles)
INSERT INTO knowledge_base_articles (category_id, title, slug, excerpt, content, tags, sort_order, is_published, read_time_minutes)
SELECT
  id,
  'Support email',
  'support-email',
  'How to reach our support team via email for help',
  '<h2>Contacting Support via Email</h2>
<p>Our support team is here to help with any questions or issues.</p>

<h3>Email Address</h3>
<p><strong>General Support:</strong></p>
<ul>
  <li>support@example.com</li>
  <li>Response time: Within 24 hours</li>
  <li>Available 7 days a week</li>
</ul>

<p><strong>Specialized Support:</strong></p>
<ul>
  <li><strong>Agency Support:</strong> agency@example.com</li>
  <li><strong>Technical Issues:</strong> tech@example.com</li>
  <li><strong>Billing Questions:</strong> billing@example.com</li>
  <li><strong>Safety/Report Abuse:</strong> safety@example.com</li>
  <li><strong>Privacy Concerns:</strong> privacy@example.com</li>
</ul>

<h3>Before You Email</h3>
<p>Check if your question is answered:</p>
<ul>
  <li>Search this Help Center</li>
  <li>Review FAQ section</li>
  <li>Check troubleshooting guides</li>
  <li>Look for relevant articles</li>
</ul>

<h3>What to Include</h3>
<p>Help us help you faster by including:</p>

<p><strong>Essential Information:</strong></p>
<ul>
  <li>Your account email address</li>
  <li>Clear description of issue/question</li>
  <li>What you were trying to do</li>
  <li>What happened instead</li>
  <li>When the issue started</li>
</ul>

<p><strong>Technical Issues:</strong></p>
<ul>
  <li>Device type (iPhone, Windows PC, etc.)</li>
  <li>Browser and version</li>
  <li>Error messages (exact text or screenshot)</li>
  <li>Steps to reproduce the problem</li>
</ul>

<p><strong>Listing Issues:</strong></p>
<ul>
  <li>Listing URL or ID</li>
  <li>Specific problem description</li>
  <li>Screenshots if applicable</li>
</ul>

<p><strong>Account Issues:</strong></p>
<ul>
  <li>Account email</li>
  <li>Description of the problem</li>
  <li>Any error messages</li>
</ul>

<h3>Email Template</h3>
<p><em>Subject: [Brief description of issue]</em></p>

<p><em>Hi Support Team,</em></p>

<p><em>Account Email: [your email]</em><br>
<em>Issue Type: [login/listing/payment/other]</em></p>

<p><em>Description:<br>
[Detailed explanation of your issue or question]</em></p>

<p><em>What I''ve tried:<br>
[Steps you''ve already taken]</em></p>

<p><em>Device/Browser: [if technical issue]</em><br>
<em>Screenshots: [attached if applicable]</em></p>

<p><em>Thank you,<br>
[Your name]</em></p>

<h3>Response Times</h3>
<p><strong>Typical Response:</strong></p>
<ul>
  <li>Simple questions: Within 12 hours</li>
  <li>Technical issues: Within 24 hours</li>
  <li>Complex problems: 24-48 hours</li>
  <li>Weekends: May be slightly longer</li>
</ul>

<p><strong>Priority Support (Agency Accounts):</strong></p>
<ul>
  <li>Faster response times</li>
  <li>Dedicated support agent</li>
  <li>Direct phone support option</li>
</ul>

<h3>Urgent Issues</h3>
<p>For time-sensitive problems:</p>
<ul>
  <li>Mark email as "URGENT" in subject</li>
  <li>Clearly state why it''s urgent</li>
  <li>Include all relevant details</li>
  <li>Consider using contact form for faster response</li>
</ul>

<p><strong>Safety Emergencies:</strong></p>
<ul>
  <li>Contact local authorities first</li>
  <li>Then email safety@example.com</li>
  <li>We respond to safety issues immediately</li>
</ul>

<h3>Follow-Up</h3>
<p>If you don''t hear back:</p>
<ul>
  <li>Check spam/junk folder</li>
  <li>Wait full 24 hours before following up</li>
  <li>Reply to original email</li>
  <li>Reference your ticket number if provided</li>
</ul>

<h3>What to Expect</h3>
<p>Our support team will:</p>
<ul>
  <li>Acknowledge your email</li>
  <li>Provide a ticket number</li>
  <li>Ask clarifying questions if needed</li>
  <li>Provide solution or next steps</li>
  <li>Follow up to ensure issue is resolved</li>
</ul>

<h3>Tips for Best Support</h3>
<ul>
  <li>Be specific and detailed</li>
  <li>Include screenshots when possible</li>
  <li>One issue per email</li>
  <li>Be patient and polite</li>
  <li>Provide all requested information</li>
  <li>Keep original email thread for reference</li>
</ul>

<h3>Other Contact Methods</h3>
<p>Besides email, you can also:</p>
<ul>
  <li>Use our contact form (faster response)</li>
  <li>Search Help Center first</li>
  <li>Join our WhatsApp community</li>
  <li>Connect on social media</li>
</ul>

<h3>Feedback Welcome</h3>
<p>We value your feedback:</p>
<ul>
  <li>Suggestions for improvements</li>
  <li>Feature requests</li>
  <li>Comments on support experience</li>
  <li>General platform feedback</li>
</ul>

<p>Send feedback to: feedback@example.com</p>',
  ARRAY['support', 'email', 'contact', 'help'],
  1,
  true,
  4
FROM knowledge_base_categories WHERE slug = 'contact-feedback';

INSERT INTO knowledge_base_articles (category_id, title, slug, excerpt, content, tags, sort_order, is_published, read_time_minutes)
SELECT
  id,
  'Contact form',
  'contact-form',
  'Send us a message through our contact form for quick assistance',
  '<h2>Using Our Contact Form</h2>
<p>Get quick help by submitting a message through our contact form.</p>

<h3>Accessing the Contact Form</h3>
<p>Find our contact form:</p>
<ul>
  <li>Navigate to "Contact Us" in footer</li>
  <li>Or visit: yoursite.com/contact</li>
  <li>Available 24/7</li>
  <li>No login required</li>
</ul>

<h3>Form Fields</h3>
<p><strong>Required Information:</strong></p>
<ul>
  <li>Name</li>
  <li>Email address</li>
  <li>Subject/Topic</li>
  <li>Message</li>
</ul>

<p><strong>Optional Information:</strong></p>
<ul>
  <li>Phone number</li>
  <li>Account email (if different)</li>
  <li>Listing ID/URL</li>
  <li>File attachments</li>
</ul>

<h3>Selecting Topic</h3>
<p>Choose the most relevant category:</p>
<ul>
  <li><strong>Account Issues:</strong> Login, password, profile problems</li>
  <li><strong>Listing Questions:</strong> Posting, editing, or removing listings</li>
  <li><strong>Technical Support:</strong> Bugs, errors, or site issues</li>
  <li><strong>Billing/Payments:</strong> Agency accounts, transactions</li>
  <li><strong>Report Abuse:</strong> Scams, inappropriate content</li>
  <li><strong>Feature Request:</strong> Suggestions for improvements</li>
  <li><strong>General Inquiry:</strong> Other questions</li>
</ul>

<h3>Writing Your Message</h3>
<p><strong>Be Clear and Specific:</strong></p>
<ul>
  <li>State your issue/question upfront</li>
  <li>Provide relevant details</li>
  <li>Explain what you''ve already tried</li>
  <li>Include error messages</li>
  <li>Mention any deadlines</li>
</ul>

<p><strong>Good Example:</strong></p>
<p><em>"I''m trying to upload photos to my listing (ID: 12345), but I keep getting an ''Upload Failed'' error. I''ve tried using JPG files under 5MB on Chrome browser. The error started yesterday after I updated my listing description. Can you help?"</em></p>

<p><strong>Poor Example:</strong></p>
<p><em>"Photos not working. Fix it."</em></p>

<h3>Attaching Files</h3>
<p>You can attach:</p>
<ul>
  <li>Screenshots of errors</li>
  <li>Images related to issue</li>
  <li>Documents for verification</li>
  <li>Maximum 3 files</li>
  <li>5MB per file</li>
  <li>Formats: JPG, PNG, PDF</li>
</ul>

<h3>After Submission</h3>
<p>What happens next:</p>
<ol>
  <li><strong>Confirmation:</strong> You''ll see success message</li>
  <li><strong>Auto-Reply:</strong> Immediate confirmation email</li>
  <li><strong>Ticket Number:</strong> Save this for reference</li>
  <li><strong>Response:</strong> Team replies within 24 hours</li>
  <li><strong>Resolution:</strong> Follow-up until issue is solved</li>
</ol>

<h3>Response Time</h3>
<p>Typical response times by topic:</p>
<ul>
  <li><strong>Safety/Abuse:</strong> Within 6 hours</li>
  <li><strong>Technical Issues:</strong> Within 12 hours</li>
  <li><strong>Account Problems:</strong> Within 12 hours</li>
  <li><strong>General Questions:</strong> Within 24 hours</li>
  <li><strong>Feature Requests:</strong> Acknowledged within 48 hours</li>
</ul>

<h3>Tracking Your Request</h3>
<p>Keep track of your inquiry:</p>
<ul>
  <li>Save ticket number from confirmation email</li>
  <li>Check email for responses</li>
  <li>Look in spam folder if no reply</li>
  <li>Use ticket number for follow-up</li>
</ul>

<h3>Following Up</h3>
<p>If you need to add information:</p>
<ul>
  <li>Reply to confirmation email</li>
  <li>Reference your ticket number</li>
  <li>Submit new form only for new issue</li>
  <li>Wait 24 hours before following up</li>
</ul>

<h3>Contact Form vs Email</h3>
<p><strong>Use Contact Form when:</strong></p>
<ul>
  <li>You need quick routing to right team</li>
  <li>You want to attach files easily</li>
  <li>You prefer structured format</li>
  <li>You don''t have an account yet</li>
</ul>

<p><strong>Use Email when:</strong></p>
<ul>
  <li>You have long, detailed inquiry</li>
  <li>You need to forward other emails</li>
  <li>You prefer traditional email</li>
  <li>You have ongoing conversation</li>
</ul>

<h3>Common Issues</h3>
<p><strong>Form Won''t Submit:</strong></p>
<ul>
  <li>Check all required fields</li>
  <li>Verify email format</li>
  <li>Check file sizes</li>
  <li>Try different browser</li>
  <li>Disable ad blockers</li>
</ul>

<p><strong>Not Receiving Confirmation:</strong></p>
<ul>
  <li>Check spam/junk folder</li>
  <li>Verify email address was correct</li>
  <li>Wait 10 minutes</li>
  <li>Check firewall/filters</li>
</ul>

<h3>Privacy</h3>
<p>Your information is:</p>
<ul>
  <li>Used only to respond to your inquiry</li>
  <li>Never sold or shared</li>
  <li>Stored securely</li>
  <li>Kept confidential</li>
  <li>Deleted after resolution (per policy)</li>
</ul>

<h3>Tips for Faster Resolution</h3>
<ul>
  <li>Choose correct topic category</li>
  <li>Provide account email if applicable</li>
  <li>Include specific listing IDs/URLs</li>
  <li>Attach relevant screenshots</li>
  <li>Describe expected vs actual behavior</li>
  <li>List troubleshooting steps you''ve tried</li>
</ul>

<h3>Alternative Contact Methods</h3>
<p>If the form isn''t working:</p>
<ul>
  <li>Email support@example.com directly</li>
  <li>Call our support hotline (agency accounts)</li>
  <li>Message us on social media</li>
  <li>Join our WhatsApp community</li>
</ul>

<h3>Hours of Operation</h3>
<p>Contact form available 24/7, but responses sent:</p>
<ul>
  <li>Monday-Friday: 9 AM - 6 PM (local time)</li>
  <li>Weekends: 10 AM - 4 PM (local time)</li>
  <li>Urgent safety issues: Responded to immediately</li>
</ul>',
  ARRAY['contact-form', 'support', 'help', 'contact'],
  2,
  true,
  4
FROM knowledge_base_categories WHERE slug = 'contact-feedback';

INSERT INTO knowledge_base_articles (category_id, title, slug, excerpt, content, tags, sort_order, is_published, read_time_minutes)
SELECT
  id,
  'Join our WhatsApp updates',
  'whatsapp-updates',
  'Stay connected and receive updates through our WhatsApp channel',
  '<h2>WhatsApp Updates</h2>
<p>Stay connected with our community and receive timely updates via WhatsApp.</p>

<h3>What We Offer</h3>
<p><strong>WhatsApp Broadcast Channel:</strong></p>
<ul>
  <li>Platform updates and news</li>
  <li>New feature announcements</li>
  <li>Tips for landlords and tenants</li>
  <li>Market insights</li>
  <li>Special promotions</li>
</ul>

<p><strong>Community Group:</strong></p>
<ul>
  <li>Connect with other users</li>
  <li>Share experiences and tips</li>
  <li>Get peer advice</li>
  <li>Network with landlords/agents</li>
  <li>Moderated for quality</li>
</ul>

<h3>How to Join</h3>
<p><strong>Broadcast Channel:</strong></p>
<ol>
  <li>Save our number: +1-555-RENTALS</li>
  <li>Send message: "JOIN UPDATES"</li>
  <li>Receive confirmation</li>
  <li>Start getting updates</li>
</ol>

<p>Or click this link: [WhatsApp Join Link]</p>

<p><strong>Community Group:</strong></p>
<ol>
  <li>Join broadcast channel first</li>
  <li>Send message: "JOIN COMMUNITY"</li>
  <li>Receive group invite link</li>
  <li>Accept invitation</li>
  <li>Introduce yourself!</li>
</ol>

<h3>What You''ll Receive</h3>
<p><strong>Weekly Updates:</strong></p>
<ul>
  <li>Market trends and stats</li>
  <li>Popular listings of the week</li>
  <li>Success stories</li>
  <li>Platform tips</li>
</ul>

<p><strong>Instant Alerts:</strong></p>
<ul>
  <li>Important platform announcements</li>
  <li>Emergency maintenance notifications</li>
  <li>Security alerts</li>
  <li>Major feature launches</li>
</ul>

<p><strong>Monthly Content:</strong></p>
<ul>
  <li>Expert rental advice</li>
  <li>Legal updates</li>
  <li>Seasonal tips</li>
  <li>Q&A sessions</li>
</ul>

<h3>Message Frequency</h3>
<p>We respect your time:</p>
<ul>
  <li>2-3 messages per week on average</li>
  <li>No spam or excessive messaging</li>
  <li>Important updates only</li>
  <li>Quiet hours respected (9 PM - 8 AM)</li>
</ul>

<h3>Community Guidelines</h3>
<p>To keep our WhatsApp community positive:</p>

<p><strong>Do:</strong></p>
<ul>
  <li>Be respectful and courteous</li>
  <li>Share helpful tips and experiences</li>
  <li>Ask relevant questions</li>
  <li>Help other community members</li>
  <li>Stay on topic</li>
</ul>

<p><strong>Don''t:</strong></p>
<ul>
  <li>Spam or post excessively</li>
  <li>Share inappropriate content</li>
  <li>Advertise unrelated products/services</li>
  <li>Use offensive language</li>
  <li>Share private information of others</li>
  <li>Engage in arguments or harassment</li>
</ul>

<h3>Getting Support via WhatsApp</h3>
<p><strong>Quick Questions:</strong></p>
<ul>
  <li>Send message to our number</li>
  <li>Auto-replies for common issues</li>
  <li>Human response during business hours</li>
  <li>15-30 minute response time</li>
</ul>

<p><strong>Complex Issues:</strong></p>
<ul>
  <li>Use contact form or email for detailed problems</li>
  <li>WhatsApp best for simple queries</li>
  <li>Can''t attach large files or screenshots easily</li>
</ul>

<h3>Privacy and Security</h3>
<p>Your privacy matters:</p>
<ul>
  <li>Your number is not shared with others</li>
  <li>Only admins see your number</li>
  <li>Messages are not forwarded outside group</li>
  <li>WhatsApp end-to-end encryption applies</li>
  <li>Can leave anytime</li>
</ul>

<h3>WhatsApp Features</h3>
<p><strong>Interactive Content:</strong></p>
<ul>
  <li>Polls about features you want</li>
  <li>Quick reply options</li>
  <li>Clickable links to listings or articles</li>
  <li>Images and infographics</li>
</ul>

<p><strong>Special Offers:</strong></p>
<ul>
  <li>WhatsApp-exclusive promotions</li>
  <li>Early access to new features</li>
  <li>Special event invitations</li>
  <li>Partner discounts</li>
</ul>

<h3>Leaving or Unsubscribing</h3>
<p>You can leave anytime:</p>
<ul>
  <li>Send "STOP" to unsubscribe from broadcasts</li>
  <li>Exit group using WhatsApp''s leave function</li>
  <li>Block our number if preferred</li>
  <li>No questions asked, no penalties</li>
</ul>

<h3>Other WhatsApp Services</h3>
<p><strong>Property Alerts:</strong></p>
<ul>
  <li>Get notified of new listings</li>
  <li>Set your preferences</li>
  <li>Receive matching properties</li>
  <li>Send "ALERTS" to set up</li>
</ul>

<p><strong>Agent Network:</strong></p>
<ul>
  <li>Exclusive group for verified agencies</li>
  <li>Share industry insights</li>
  <li>Collaborate on listings</li>
  <li>Request access if eligible</li>
</ul>

<h3>International Users</h3>
<p>WhatsApp works globally:</p>
<ul>
  <li>No international SMS charges</li>
  <li>Works with any phone number</li>
  <li>Data/WiFi connection required</li>
  <li>Updates in English (currently)</li>
</ul>

<h3>Technical Requirements</h3>
<ul>
  <li>WhatsApp installed on your device</li>
  <li>Active phone number</li>
  <li>Internet connection</li>
  <li>Updated WhatsApp version recommended</li>
</ul>

<h3>Troubleshooting</h3>
<p><strong>Not Receiving Messages:</strong></p>
<ul>
  <li>Check if you blocked the number</li>
  <li>Verify you''re still in the group</li>
  <li>Check WhatsApp notification settings</li>
  <li>Ensure you have internet connection</li>
  <li>Try leaving and rejoining</li>
</ul>

<p><strong>Too Many Messages:</strong></p>
<ul>
  <li>Mute group notifications</li>
  <li>Leave community group but keep broadcast</li>
  <li>Send "LESS" to reduce frequency</li>
</ul>

<h3>Feedback Welcome</h3>
<p>Help us improve:</p>
<ul>
  <li>Share your experience</li>
  <li>Suggest content topics</li>
  <li>Report any issues</li>
  <li>Let us know what''s working</li>
</ul>

<p>Send "FEEDBACK" followed by your message.</p>

<h3>Join Today!</h3>
<p>Don''t miss out on valuable updates and community connections:</p>
<ol>
  <li>Click the join link above</li>
  <li>Or send "JOIN" to +1-555-RENTALS</li>
  <li>Receive welcome message</li>
  <li>Start benefiting immediately!</li>
</ol>

<p>Questions? Email whatsapp@example.com</p>',
  ARRAY['whatsapp', 'updates', 'community', 'contact'],
  3,
  true,
  5
FROM knowledge_base_categories WHERE slug = 'contact-feedback';