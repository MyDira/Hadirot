import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface Category {
  name: string;
  slug: string;
  description: string;
  icon: string;
  sort_order: number;
}

interface Article {
  category_slug: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  tags: string[];
  sort_order: number;
  is_published: boolean;
  read_time_minutes: number;
}

const categories: Category[] = [
  {
    name: 'Getting Started',
    slug: 'getting-started',
    description: 'Learn the basics of using our platform to find or list rental properties',
    icon: 'Rocket',
    sort_order: 1,
  },
  {
    name: 'Posting Listings',
    slug: 'posting-listings',
    description: 'Everything you need to know about creating and managing your property listings',
    icon: 'Home',
    sort_order: 2,
  },
  {
    name: 'Browsing Properties',
    slug: 'browsing-properties',
    description: 'Find your perfect rental with our powerful search and filtering tools',
    icon: 'Search',
    sort_order: 3,
  },
  {
    name: 'Account Management',
    slug: 'account-management',
    description: 'Manage your profile, settings, and account preferences',
    icon: 'User',
    sort_order: 4,
  },
  {
    name: 'Featured Listings',
    slug: 'featured-listings',
    description: 'Learn about featured listings and how to boost your property visibility',
    icon: 'Star',
    sort_order: 5,
  },
  {
    name: 'Favorites & Saved Searches',
    slug: 'favorites',
    description: 'Save and organize properties you love for easy access later',
    icon: 'Heart',
    sort_order: 6,
  },
  {
    name: 'Agency Features',
    slug: 'agency-features',
    description: 'Tools and features for real estate agencies managing multiple properties',
    icon: 'Building2',
    sort_order: 7,
  },
  {
    name: 'Community Guidelines',
    slug: 'guidelines',
    description: 'Rules and best practices for maintaining a trusted community',
    icon: 'Shield',
    sort_order: 8,
  },
  {
    name: 'Technical Support',
    slug: 'technical-support',
    description: 'Troubleshooting tips and solutions to common technical issues',
    icon: 'Settings',
    sort_order: 9,
  },
];

const articles: Article[] = [
  // Getting Started
  {
    category_slug: 'getting-started',
    title: 'Welcome to Our Rental Platform',
    slug: 'welcome',
    excerpt: 'Get started with finding your next home or listing your property in our local community.',
    content: `
      <h2>Welcome to the Heart of Local Rentals</h2>
      <p>Welcome! Our platform connects families and property owners in the community, making it easy to find and list rental properties.</p>

      <h3>What You Can Do Here</h3>
      <ul>
        <li><strong>Browse Properties:</strong> Search through available rentals with detailed filters for bedrooms, price, location, and amenities</li>
        <li><strong>Post Listings:</strong> List your rental property with photos and detailed information</li>
        <li><strong>Save Favorites:</strong> Keep track of properties you're interested in</li>
        <li><strong>Manage Your Account:</strong> Update your profile and preferences</li>
      </ul>

      <h3>Getting Started as a Tenant</h3>
      <p>Looking for a rental? Start by browsing our listings or create an account to save your favorites and get notifications about new properties.</p>

      <h3>Getting Started as a Landlord</h3>
      <p>Have a property to rent? Create an account, post your listing with photos and details, and connect with potential tenants in the community.</p>

      <h3>Need Help?</h3>
      <p>Browse through our help articles organized by topic, or contact us if you have specific questions.</p>
    `,
    tags: ['introduction', 'basics', 'overview'],
    sort_order: 1,
    is_published: true,
    read_time_minutes: 3,
  },
  {
    category_slug: 'getting-started',
    title: 'Creating Your Account',
    slug: 'creating-account',
    excerpt: 'Learn how to sign up and set up your profile on our platform.',
    content: `
      <h2>Creating Your Account</h2>
      <p>Creating an account allows you to post listings, save favorites, and manage your activity on the platform.</p>

      <h3>Sign Up Process</h3>
      <ol>
        <li>Click the "Sign In" button in the top navigation</li>
        <li>Select "Sign Up" to create a new account</li>
        <li>Enter your email address and create a secure password</li>
        <li>Complete your profile with your full name and phone number</li>
        <li>Select your role: Tenant, Landlord, or Agent</li>
      </ol>

      <h3>Profile Information</h3>
      <p>Your profile includes:</p>
      <ul>
        <li><strong>Full Name:</strong> Used in communications and listings</li>
        <li><strong>Phone Number:</strong> How interested parties can contact you</li>
        <li><strong>Email:</strong> For account notifications and updates</li>
        <li><strong>Role:</strong> Identifies you as a tenant, landlord, or agent</li>
      </ul>

      <h3>Account Security</h3>
      <p>Keep your account secure by using a strong password and never sharing your login credentials.</p>
    `,
    tags: ['account', 'signup', 'registration', 'profile'],
    sort_order: 2,
    is_published: true,
    read_time_minutes: 4,
  },

  // Posting Listings
  {
    category_slug: 'posting-listings',
    title: 'How to Post a Listing',
    slug: 'how-to-post-listing',
    excerpt: 'Step-by-step guide to creating your first property listing.',
    content: `
      <h2>Posting Your First Listing</h2>
      <p>Ready to list your property? Follow these steps to create an effective listing that attracts quality tenants.</p>

      <h3>Before You Begin</h3>
      <p>Make sure you have:</p>
      <ul>
        <li>High-quality photos of your property</li>
        <li>Detailed property information (size, bedrooms, bathrooms)</li>
        <li>Rental price and lease terms</li>
        <li>Contact information for interested parties</li>
      </ul>

      <h3>Step-by-Step Process</h3>
      <ol>
        <li><strong>Navigate to Post Listing:</strong> Click "List a Property" in the main navigation</li>
        <li><strong>Enter Property Details:</strong>
          <ul>
            <li>Title: Create a clear, descriptive title</li>
            <li>Location: Enter the address or neighborhood</li>
            <li>Property Type: Select apartment building, apartment in house, or full house</li>
            <li>Bedrooms and Bathrooms: Specify the number</li>
            <li>Floor: If applicable, indicate which floor</li>
          </ul>
        </li>
        <li><strong>Set Pricing:</strong> Enter monthly rent or select "Call for Price" if pricing is negotiable</li>
        <li><strong>Add Amenities:</strong>
          <ul>
            <li>Parking availability</li>
            <li>Washer/dryer hookup</li>
            <li>Dishwasher</li>
            <li>Heat included or tenant pays</li>
          </ul>
        </li>
        <li><strong>Upload Photos:</strong> Add up to 10 high-quality images showcasing your property</li>
        <li><strong>Write Description:</strong> Provide detailed information about the property and neighborhood</li>
        <li><strong>Add Contact Information:</strong> Include your name and phone number for inquiries</li>
        <li><strong>Submit for Review:</strong> Your listing will be reviewed before going live</li>
      </ol>

      <h3>Tips for Great Listings</h3>
      <ul>
        <li>Use clear, well-lit photos from multiple angles</li>
        <li>Be accurate and honest in your descriptions</li>
        <li>Highlight unique features and recent updates</li>
        <li>Mention nearby amenities and transportation</li>
        <li>Respond promptly to inquiries</li>
      </ul>
    `,
    tags: ['posting', 'listing', 'create', 'landlord'],
    sort_order: 1,
    is_published: true,
    read_time_minutes: 6,
  },
  {
    category_slug: 'posting-listings',
    title: 'Listing Approval Process',
    slug: 'listing-approval',
    excerpt: 'Understand how listings are reviewed and approved for publication.',
    content: `
      <h2>How Listing Approval Works</h2>
      <p>All listings go through a review process to ensure quality and accuracy for our community.</p>

      <h3>The Approval Process</h3>
      <ol>
        <li><strong>Submission:</strong> After you submit your listing, it enters the review queue</li>
        <li><strong>Review:</strong> Our team reviews listings within 24-48 hours</li>
        <li><strong>Approval:</strong> Once approved, your listing goes live immediately</li>
        <li><strong>Notification:</strong> You'll receive an email when your listing is approved</li>
      </ol>

      <h3>What We Look For</h3>
      <p>During review, we check that listings:</p>
      <ul>
        <li>Have clear, appropriate photos</li>
        <li>Include accurate property information</li>
        <li>Follow community guidelines</li>
        <li>Have complete contact information</li>
        <li>Meet basic quality standards</li>
      </ul>

      <h3>Common Reasons for Delays</h3>
      <ul>
        <li>Missing or unclear photos</li>
        <li>Incomplete property details</li>
        <li>Inappropriate content</li>
        <li>Duplicate listings</li>
      </ul>

      <h3>After Approval</h3>
      <p>Once approved, your listing will appear in search results and can receive inquiries. You can edit your listing anytime from your dashboard.</p>
    `,
    tags: ['approval', 'review', 'moderation', 'waiting'],
    sort_order: 2,
    is_published: true,
    read_time_minutes: 4,
  },
  {
    category_slug: 'posting-listings',
    title: 'Managing Your Listings',
    slug: 'managing-listings',
    excerpt: 'Learn how to edit, update, and manage your property listings.',
    content: `
      <h2>Managing Your Listings</h2>
      <p>Keep your listings up to date and manage them effectively from your dashboard.</p>

      <h3>Accessing Your Listings</h3>
      <ol>
        <li>Log in to your account</li>
        <li>Click "Dashboard" in the navigation</li>
        <li>View all your listings with their current status</li>
      </ol>

      <h3>Editing a Listing</h3>
      <p>To make changes to an existing listing:</p>
      <ol>
        <li>Go to your Dashboard</li>
        <li>Find the listing you want to edit</li>
        <li>Click the "Edit" button</li>
        <li>Make your changes</li>
        <li>Save the updates</li>
      </ol>
      <p><em>Note: Major changes may require re-approval.</em></p>

      <h3>Deactivating a Listing</h3>
      <p>When your property is rented:</p>
      <ol>
        <li>Navigate to your Dashboard</li>
        <li>Find the listing</li>
        <li>Toggle the "Active" status to deactivate</li>
      </ol>
      <p>Deactivated listings won't appear in search results but remain in your dashboard for future reference.</p>

      <h3>Listing Statistics</h3>
      <p>Track your listing performance:</p>
      <ul>
        <li><strong>Views:</strong> How many times people viewed your listing</li>
        <li><strong>Impressions:</strong> How often your listing appeared in search results</li>
        <li><strong>Posted Date:</strong> When the listing went live</li>
      </ul>
    `,
    tags: ['edit', 'manage', 'update', 'dashboard', 'deactivate'],
    sort_order: 3,
    is_published: true,
    read_time_minutes: 5,
  },
  {
    category_slug: 'posting-listings',
    title: 'Photography Tips for Listings',
    slug: 'photography-tips',
    excerpt: 'Best practices for taking photos that showcase your property.',
    content: `
      <h2>Photography Tips for Great Listings</h2>
      <p>Quality photos are essential for attracting tenants. Follow these tips to make your property shine.</p>

      <h3>Essential Shots</h3>
      <p>Include photos of:</p>
      <ul>
        <li>Living room from multiple angles</li>
        <li>Kitchen showing appliances and counter space</li>
        <li>Each bedroom</li>
        <li>Bathrooms</li>
        <li>Building exterior or entrance</li>
        <li>Any unique features or recent renovations</li>
      </ul>

      <h3>Photography Best Practices</h3>
      <ul>
        <li><strong>Lighting:</strong> Take photos during the day with natural light. Open curtains and turn on lights</li>
        <li><strong>Cleanliness:</strong> Tidy up spaces before photographing. Remove clutter and personal items</li>
        <li><strong>Angles:</strong> Stand in corners to capture as much of the room as possible</li>
        <li><strong>Quality:</strong> Use a smartphone or camera, not blurry or dark images</li>
        <li><strong>Honest Representation:</strong> Don't over-edit or misrepresent the space</li>
      </ul>

      <h3>What to Avoid</h3>
      <ul>
        <li>Dark or blurry photos</li>
        <li>Photos with people in them</li>
        <li>Excessive filters or editing</li>
        <li>Photos of unfinished or damaged areas</li>
        <li>Images taken from odd angles</li>
      </ul>

      <h3>Image Requirements</h3>
      <ul>
        <li>Format: JPG or PNG</li>
        <li>Maximum: 10 images per listing</li>
        <li>Recommended resolution: At least 1024x768 pixels</li>
        <li>File size: Under 5MB per image</li>
      </ul>
    `,
    tags: ['photos', 'images', 'photography', 'tips'],
    sort_order: 4,
    is_published: true,
    read_time_minutes: 4,
  },

  // Browsing Properties
  {
    category_slug: 'browsing-properties',
    title: 'Searching for Properties',
    slug: 'searching-properties',
    excerpt: 'Learn how to use our search and filter tools to find your perfect rental.',
    content: `
      <h2>Finding Your Perfect Rental</h2>
      <p>Our powerful search tools help you find properties that match your needs.</p>

      <h3>Getting Started</h3>
      <p>Click "Find Yours" on the homepage or "Browse" in the navigation to see all available listings.</p>

      <h3>Using Filters</h3>
      <p>Narrow down results with our filter options:</p>
      <ul>
        <li><strong>Bedrooms:</strong> Select 1, 2, 3, 4, or 5+ bedrooms</li>
        <li><strong>Price Range:</strong> Set minimum and maximum rent</li>
        <li><strong>Property Type:</strong> Choose apartment building, apartment in house, or full house</li>
        <li><strong>Parking:</strong> Filter by parking availability</li>
        <li><strong>Amenities:</strong> Filter for washer/dryer hookup, dishwasher, etc.</li>
        <li><strong>Heat:</strong> Select if heat is included or tenant pays</li>
      </ul>

      <h3>Viewing Results</h3>
      <p>Browse listings in an easy-to-scan grid format showing:</p>
      <ul>
        <li>Property photo</li>
        <li>Price</li>
        <li>Location</li>
        <li>Number of bedrooms and bathrooms</li>
        <li>Key features</li>
      </ul>

      <h3>Sorting Options</h3>
      <p>Sort listings by:</p>
      <ul>
        <li>Most Recent (default)</li>
        <li>Price: Low to High</li>
        <li>Price: High to Low</li>
        <li>Most Popular</li>
      </ul>

      <h3>Tips for Effective Searching</h3>
      <ul>
        <li>Start with broad criteria and narrow down gradually</li>
        <li>Check back regularly for new listings</li>
        <li>Save properties you like to compare later</li>
        <li>Contact landlords quickly for popular properties</li>
      </ul>
    `,
    tags: ['search', 'browse', 'filter', 'find'],
    sort_order: 1,
    is_published: true,
    read_time_minutes: 5,
  },
  {
    category_slug: 'browsing-properties',
    title: 'Understanding Listing Details',
    slug: 'listing-details',
    excerpt: 'Learn what information is included in property listings and what to look for.',
    content: `
      <h2>Understanding Listing Information</h2>
      <p>Each listing provides detailed information to help you make informed decisions.</p>

      <h3>Basic Information</h3>
      <ul>
        <li><strong>Title:</strong> Quick summary of the property</li>
        <li><strong>Price:</strong> Monthly rent (some listings show "Call for Price")</li>
        <li><strong>Location:</strong> Address or general neighborhood</li>
        <li><strong>Bedrooms & Bathrooms:</strong> Number of each</li>
        <li><strong>Square Footage:</strong> Size of the unit (when available)</li>
        <li><strong>Floor:</strong> Which floor the unit is on (for apartments)</li>
      </ul>

      <h3>Property Features</h3>
      <ul>
        <li><strong>Property Type:</strong> Apartment building, apartment in house, or full house</li>
        <li><strong>Parking:</strong> Yes, Included, Optional (extra cost), or No</li>
        <li><strong>Washer/Dryer Hookup:</strong> Available or not</li>
        <li><strong>Dishwasher:</strong> Included or not</li>
        <li><strong>Heat:</strong> Included in rent or tenant pays separately</li>
        <li><strong>Broker Fee:</strong> Whether a broker fee applies</li>
        <li><strong>Lease Length:</strong> Preferred lease duration</li>
      </ul>

      <h3>Photos and Description</h3>
      <p>Review multiple photos to get a complete picture of the property. Read the full description for additional details about:</p>
      <ul>
        <li>Recent renovations or updates</li>
        <li>Neighborhood amenities</li>
        <li>Pet policies</li>
        <li>Available move-in dates</li>
        <li>Application requirements</li>
      </ul>

      <h3>Contact Information</h3>
      <p>Each listing includes contact details for the landlord or agent. You can:</p>
      <ul>
        <li>Call the provided phone number</li>
        <li>Use the contact form to send a message</li>
        <li>Save the listing to favorites for later</li>
      </ul>

      <h3>Listing Statistics</h3>
      <p>Some listings show:</p>
      <ul>
        <li><strong>Views:</strong> How many people have viewed the listing</li>
        <li><strong>Posted Date:</strong> When the listing was published</li>
        <li><strong>Featured Badge:</strong> Indicates promoted listings</li>
      </ul>
    `,
    tags: ['details', 'information', 'features', 'amenities'],
    sort_order: 2,
    is_published: true,
    read_time_minutes: 5,
  },
  {
    category_slug: 'browsing-properties',
    title: 'Contacting Landlords',
    slug: 'contacting-landlords',
    excerpt: 'Best practices for reaching out to property owners and agents.',
    content: `
      <h2>Contacting Property Owners</h2>
      <p>Ready to inquire about a property? Here's how to make a great first impression.</p>

      <h3>How to Contact</h3>
      <p>Each listing provides contact information. You can:</p>
      <ul>
        <li>Call the phone number listed</li>
        <li>Use the contact form on the listing page</li>
      </ul>

      <h3>What to Include in Your Message</h3>
      <p>When contacting a landlord, include:</p>
      <ul>
        <li>Your full name</li>
        <li>The property you're interested in</li>
        <li>Your desired move-in date</li>
        <li>Number of occupants</li>
        <li>Brief background (employment, references)</li>
        <li>Any specific questions about the property</li>
        <li>Your contact information</li>
      </ul>

      <h3>Sample Message Template</h3>
      <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
        <p style="margin: 0;"><em>
          "Hello, my name is [Your Name] and I'm interested in your [X] bedroom property at [Location].
          I'm looking to move in around [Date] and would love to schedule a viewing.
          I work as a [Your Profession] and can provide references.
          Please let me know what times work for a showing.
          You can reach me at [Your Phone]. Thank you!"
        </em></p>
      </div>

      <h3>Response Times</h3>
      <p>Most landlords respond within 24-48 hours. For popular listings, expect faster response times and act quickly.</p>

      <h3>Tips for Success</h3>
      <ul>
        <li>Be professional and courteous</li>
        <li>Respond promptly to follow-up questions</li>
        <li>Be prepared for a viewing with questions ready</li>
        <li>Have your documentation ready (ID, proof of income, references)</li>
        <li>Be honest about your situation and needs</li>
      </ul>

      <h3>Red Flags to Watch For</h3>
      <ul>
        <li>Requests for money before viewing the property</li>
        <li>Landlords who won't allow property viewings</li>
        <li>Prices significantly below market rate</li>
        <li>Pressure to commit immediately without seeing the property</li>
      </ul>
    `,
    tags: ['contact', 'landlord', 'message', 'inquiry'],
    sort_order: 3,
    is_published: true,
    read_time_minutes: 5,
  },

  // Account Management
  {
    category_slug: 'account-management',
    title: 'Managing Your Profile',
    slug: 'managing-profile',
    excerpt: 'Update your account information and preferences.',
    content: `
      <h2>Managing Your Profile</h2>
      <p>Keep your account information up to date to ensure smooth communication.</p>

      <h3>Accessing Account Settings</h3>
      <ol>
        <li>Log in to your account</li>
        <li>Click your name or profile icon in the navigation</li>
        <li>Select "Account Settings"</li>
      </ol>

      <h3>Profile Information You Can Update</h3>
      <ul>
        <li><strong>Full Name:</strong> Your display name</li>
        <li><strong>Email:</strong> Used for notifications and login</li>
        <li><strong>Phone Number:</strong> Contact number for inquiries</li>
        <li><strong>Role:</strong> Tenant, Landlord, or Agent</li>
        <li><strong>Agency:</strong> If you're part of a real estate agency</li>
      </ul>

      <h3>Changing Your Password</h3>
      <ol>
        <li>Go to Account Settings</li>
        <li>Find the "Change Password" section</li>
        <li>Enter your current password</li>
        <li>Enter and confirm your new password</li>
        <li>Save changes</li>
      </ol>

      <h3>Email Preferences</h3>
      <p>Control which notifications you receive:</p>
      <ul>
        <li>New listing alerts</li>
        <li>Responses to your listings</li>
        <li>Account updates</li>
        <li>Weekly digest of new properties</li>
      </ul>

      <h3>Privacy Settings</h3>
      <p>Manage your privacy preferences:</p>
      <ul>
        <li>Choose what information is visible on your listings</li>
        <li>Control who can contact you</li>
        <li>Manage data sharing preferences</li>
      </ul>
    `,
    tags: ['profile', 'settings', 'account', 'preferences'],
    sort_order: 1,
    is_published: true,
    read_time_minutes: 4,
  },
  {
    category_slug: 'account-management',
    title: 'Resetting Your Password',
    slug: 'reset-password',
    excerpt: 'Learn how to reset your password if you forget it.',
    content: `
      <h2>Password Reset</h2>
      <p>Forgot your password? No problem. Follow these steps to regain access to your account.</p>

      <h3>Requesting a Password Reset</h3>
      <ol>
        <li>Go to the login page</li>
        <li>Click "Forgot Password?"</li>
        <li>Enter the email address associated with your account</li>
        <li>Click "Send Reset Link"</li>
      </ol>

      <h3>Checking Your Email</h3>
      <p>You'll receive an email with a password reset link within a few minutes. Check your spam folder if you don't see it in your inbox.</p>

      <h3>Creating a New Password</h3>
      <ol>
        <li>Click the reset link in your email</li>
        <li>Enter your new password (must be at least 8 characters)</li>
        <li>Confirm your new password</li>
        <li>Submit the form</li>
        <li>Log in with your new password</li>
      </ol>

      <h3>Password Requirements</h3>
      <p>For security, passwords must:</p>
      <ul>
        <li>Be at least 8 characters long</li>
        <li>Contain a mix of letters and numbers (recommended)</li>
        <li>Not be a commonly used password</li>
      </ul>

      <h3>Troubleshooting</h3>
      <p><strong>Didn't receive the email?</strong></p>
      <ul>
        <li>Check your spam/junk folder</li>
        <li>Verify you entered the correct email address</li>
        <li>Wait a few minutes and try again</li>
        <li>Contact support if the issue persists</li>
      </ul>

      <h3>Account Security Tips</h3>
      <ul>
        <li>Use a unique password for this account</li>
        <li>Don't share your password with anyone</li>
        <li>Change your password regularly</li>
        <li>Log out on shared devices</li>
      </ul>
    `,
    tags: ['password', 'reset', 'forgot', 'security'],
    sort_order: 2,
    is_published: true,
    read_time_minutes: 3,
  },

  // Featured Listings
  {
    category_slug: 'featured-listings',
    title: 'What Are Featured Listings?',
    slug: 'what-are-featured-listings',
    excerpt: 'Learn about featured listings and their benefits.',
    content: `
      <h2>Featured Listings Explained</h2>
      <p>Featured listings receive premium placement and increased visibility on our platform.</p>

      <h3>Benefits of Featured Listings</h3>
      <ul>
        <li><strong>Top Placement:</strong> Appear at the top of search results</li>
        <li><strong>Homepage Visibility:</strong> Featured on the homepage</li>
        <li><strong>Special Badge:</strong> Stand out with a "Featured" badge</li>
        <li><strong>Increased Views:</strong> Get significantly more views than regular listings</li>
        <li><strong>Faster Results:</strong> Rent your property faster with increased exposure</li>
      </ul>

      <h3>Who Can Feature Listings?</h3>
      <p>Featured listings are available to:</p>
      <ul>
        <li>Individual landlords and property owners</li>
        <li>Real estate agents</li>
        <li>Property management companies</li>
      </ul>

      <h3>How Long Do Featured Listings Last?</h3>
      <p>Featured listings typically remain promoted for a set period (e.g., 30 days). You can check the expiration date in your dashboard.</p>

      <h3>Pricing and Availability</h3>
      <p>Contact us for information about featured listing packages and pricing. Different options are available based on your needs.</p>

      <h3>Best Practices for Featured Listings</h3>
      <p>Maximize your featured listing's impact by:</p>
      <ul>
        <li>Using high-quality photos</li>
        <li>Writing detailed, accurate descriptions</li>
        <li>Keeping contact information current</li>
        <li>Responding quickly to inquiries</li>
        <li>Updating availability promptly</li>
      </ul>
    `,
    tags: ['featured', 'promotion', 'visibility', 'premium'],
    sort_order: 1,
    is_published: true,
    read_time_minutes: 4,
  },

  // Favorites
  {
    category_slug: 'favorites',
    title: 'Saving Favorite Properties',
    slug: 'saving-favorites',
    excerpt: 'Learn how to save and organize properties you love.',
    content: `
      <h2>Using the Favorites Feature</h2>
      <p>Save properties you're interested in for easy access and comparison later.</p>

      <h3>How to Save a Favorite</h3>
      <ol>
        <li>Browse listings or view a specific property</li>
        <li>Click the heart icon on the listing card or detail page</li>
        <li>The property is instantly saved to your favorites</li>
      </ol>
      <p><em>Note: You must be logged in to save favorites.</em></p>

      <h3>Viewing Your Favorites</h3>
      <ol>
        <li>Log in to your account</li>
        <li>Click "Favorites" in the navigation or go to your Dashboard</li>
        <li>Browse all your saved properties in one place</li>
      </ol>

      <h3>Managing Favorites</h3>
      <ul>
        <li><strong>Remove:</strong> Click the heart icon again to remove from favorites</li>
        <li><strong>Compare:</strong> View multiple favorite properties side by side</li>
        <li><strong>Quick Access:</strong> All saved properties are accessible from one page</li>
      </ul>

      <h3>Why Use Favorites?</h3>
      <ul>
        <li>Keep track of properties during your search</li>
        <li>Compare multiple options easily</li>
        <li>Return to interesting properties later</li>
        <li>Don't lose track of great finds</li>
        <li>Share your shortlist with family or roommates</li>
      </ul>

      <h3>Tips</h3>
      <ul>
        <li>Save any property you're even slightly interested in</li>
        <li>Review your favorites regularly as new properties become available</li>
        <li>Remove properties once they're no longer available or relevant</li>
        <li>Use favorites to narrow down your final choices</li>
      </ul>
    `,
    tags: ['favorites', 'saved', 'wishlist', 'bookmarks'],
    sort_order: 1,
    is_published: true,
    read_time_minutes: 3,
  },

  // Agency Features
  {
    category_slug: 'agency-features',
    title: 'Agency Pages and Profiles',
    slug: 'agency-pages',
    excerpt: 'Learn about agency features for real estate professionals.',
    content: `
      <h2>Agency Features</h2>
      <p>Real estate agencies can create branded pages to showcase their listings and services.</p>

      <h3>Agency Profile Page</h3>
      <p>Agencies get a dedicated page featuring:</p>
      <ul>
        <li><strong>Agency Logo:</strong> Your branded logo</li>
        <li><strong>Banner Image:</strong> Large hero image</li>
        <li><strong>About Section:</strong> Detailed description of your agency</li>
        <li><strong>Contact Information:</strong> Phone, email, and website</li>
        <li><strong>All Listings:</strong> Showcase all your active properties</li>
      </ul>

      <h3>Setting Up Your Agency</h3>
      <ol>
        <li>Create an account with the "Agent" role</li>
        <li>Contact us to set up your agency profile</li>
        <li>Provide your agency information and branding</li>
        <li>Start posting listings under your agency</li>
      </ol>

      <h3>Benefits for Agencies</h3>
      <ul>
        <li>Professional branded presence</li>
        <li>Centralized listing management</li>
        <li>Build your agency's reputation</li>
        <li>Increased visibility for all your properties</li>
        <li>Direct contact from interested renters</li>
      </ul>

      <h3>Agency Listing Management</h3>
      <p>Agencies can:</p>
      <ul>
        <li>Post multiple listings</li>
        <li>Manage all properties from one dashboard</li>
        <li>Track performance across all listings</li>
        <li>Feature select properties</li>
        <li>Update agency information anytime</li>
      </ul>

      <h3>Getting Started as an Agency</h3>
      <p>Contact us to learn more about agency accounts and get set up with your branded presence on our platform.</p>
    `,
    tags: ['agency', 'real estate', 'professional', 'business'],
    sort_order: 1,
    is_published: true,
    read_time_minutes: 4,
  },

  // Community Guidelines
  {
    category_slug: 'guidelines',
    title: 'Community Guidelines and Rules',
    slug: 'community-guidelines',
    excerpt: 'Rules and best practices for using our platform responsibly.',
    content: `
      <h2>Community Guidelines</h2>
      <p>Our platform thrives on trust and respect. Please follow these guidelines to maintain a positive community.</p>

      <h3>Posting Requirements</h3>
      <p>All listings must:</p>
      <ul>
        <li>Be for actual available rental properties</li>
        <li>Include accurate information and pricing</li>
        <li>Use real photos of the property</li>
        <li>Comply with fair housing laws</li>
        <li>Include legitimate contact information</li>
      </ul>

      <h3>Prohibited Content</h3>
      <p>Do not post:</p>
      <ul>
        <li>Fake or fraudulent listings</li>
        <li>Properties you don't have authority to rent</li>
        <li>Discriminatory content or requirements</li>
        <li>Spam or promotional content unrelated to rentals</li>
        <li>Duplicate listings</li>
        <li>Inappropriate or offensive content</li>
      </ul>

      <h3>Communication Guidelines</h3>
      <ul>
        <li>Be professional and respectful</li>
        <li>Respond to inquiries in a timely manner</li>
        <li>Provide accurate information</li>
        <li>No harassment or inappropriate behavior</li>
        <li>Keep communications on-platform when possible</li>
      </ul>

      <h3>Fair Housing Compliance</h3>
      <p>All users must comply with fair housing laws. Listings cannot discriminate based on:</p>
      <ul>
        <li>Race or color</li>
        <li>Religion</li>
        <li>National origin</li>
        <li>Sex or gender</li>
        <li>Familial status</li>
        <li>Disability</li>
      </ul>

      <h3>Consequences of Violations</h3>
      <p>Violations may result in:</p>
      <ul>
        <li>Listing removal</li>
        <li>Account warnings</li>
        <li>Temporary suspension</li>
        <li>Permanent account ban</li>
        <li>Legal action for serious violations</li>
      </ul>

      <h3>Reporting Issues</h3>
      <p>If you encounter inappropriate content or behavior:</p>
      <ol>
        <li>Use the "Report" button on the listing or profile</li>
        <li>Provide details about the issue</li>
        <li>Our team will review and take appropriate action</li>
      </ol>
    `,
    tags: ['guidelines', 'rules', 'policy', 'prohibited', 'compliance'],
    sort_order: 1,
    is_published: true,
    read_time_minutes: 5,
  },
  {
    category_slug: 'guidelines',
    title: 'Privacy and Data Protection',
    slug: 'privacy-data',
    excerpt: 'How we protect your personal information and privacy.',
    content: `
      <h2>Privacy and Data Protection</h2>
      <p>We take your privacy seriously and are committed to protecting your personal information.</p>

      <h3>Information We Collect</h3>
      <ul>
        <li><strong>Account Information:</strong> Name, email, phone number, role</li>
        <li><strong>Listing Information:</strong> Property details and photos you upload</li>
        <li><strong>Usage Data:</strong> How you interact with the platform</li>
        <li><strong>Communications:</strong> Messages sent through our platform</li>
      </ul>

      <h3>How We Use Your Information</h3>
      <ul>
        <li>Provide platform services</li>
        <li>Display your listings and contact information</li>
        <li>Send important account notifications</li>
        <li>Improve our services</li>
        <li>Ensure platform security</li>
      </ul>

      <h3>Information Sharing</h3>
      <p>We do not sell your personal information. Information is only shared:</p>
      <ul>
        <li>As displayed in your public listings</li>
        <li>When you contact other users</li>
        <li>When required by law</li>
        <li>With your explicit consent</li>
      </ul>

      <h3>Your Privacy Rights</h3>
      <ul>
        <li>Access your personal data</li>
        <li>Correct inaccurate information</li>
        <li>Request data deletion</li>
        <li>Opt out of marketing communications</li>
        <li>Export your data</li>
      </ul>

      <h3>Data Security</h3>
      <p>We implement security measures including:</p>
      <ul>
        <li>Encrypted data transmission</li>
        <li>Secure password storage</li>
        <li>Regular security updates</li>
        <li>Access controls and monitoring</li>
      </ul>

      <h3>Contact Us About Privacy</h3>
      <p>For privacy concerns or requests, contact us through our Contact page or email us directly.</p>

      <p><em>For complete details, please review our full Privacy Policy.</em></p>
    `,
    tags: ['privacy', 'data', 'security', 'GDPR', 'personal information'],
    sort_order: 2,
    is_published: true,
    read_time_minutes: 4,
  },

  // Technical Support
  {
    category_slug: 'technical-support',
    title: 'Troubleshooting Common Issues',
    slug: 'troubleshooting',
    excerpt: 'Solutions to common technical problems.',
    content: `
      <h2>Troubleshooting Guide</h2>
      <p>Having technical difficulties? Try these solutions to common problems.</p>

      <h3>Can't Log In</h3>
      <p><strong>Solutions:</strong></p>
      <ul>
        <li>Verify you're using the correct email address</li>
        <li>Check that Caps Lock is off when entering your password</li>
        <li>Clear your browser cache and cookies</li>
        <li>Try a different browser</li>
        <li>Use the "Forgot Password" feature to reset</li>
      </ul>

      <h3>Photos Won't Upload</h3>
      <p><strong>Solutions:</strong></p>
      <ul>
        <li>Check file size (must be under 5MB per image)</li>
        <li>Verify file format (JPG or PNG only)</li>
        <li>Try a different browser</li>
        <li>Check your internet connection</li>
        <li>Reduce image resolution if too large</li>
        <li>Make sure you haven't exceeded the 10 image limit</li>
      </ul>

      <h3>Search Not Working</h3>
      <p><strong>Solutions:</strong></p>
      <ul>
        <li>Refresh the page</li>
        <li>Clear your search filters and try again</li>
        <li>Check your internet connection</li>
        <li>Try different search criteria</li>
        <li>Update your browser to the latest version</li>
      </ul>

      <h3>Changes Not Saving</h3>
      <p><strong>Solutions:</strong></p>
      <ul>
        <li>Ensure all required fields are filled out</li>
        <li>Check your internet connection</li>
        <li>Don't navigate away before saving completes</li>
        <li>Try clearing your browser cache</li>
        <li>Disable browser extensions temporarily</li>
      </ul>

      <h3>Page Not Loading</h3>
      <p><strong>Solutions:</strong></p>
      <ul>
        <li>Refresh the page</li>
        <li>Check your internet connection</li>
        <li>Clear browser cache and cookies</li>
        <li>Try a different browser or device</li>
        <li>Disable ad blockers or VPNs</li>
      </ul>

      <h3>Mobile Issues</h3>
      <p><strong>Solutions:</strong></p>
      <ul>
        <li>Update your mobile browser</li>
        <li>Try the desktop version of the site</li>
        <li>Clear your mobile browser cache</li>
        <li>Ensure you have a stable internet connection</li>
        <li>Restart your device</li>
      </ul>

      <h3>Still Having Problems?</h3>
      <p>If these solutions don't help, please contact our support team with details about:</p>
      <ul>
        <li>What you were trying to do</li>
        <li>What went wrong</li>
        <li>Your browser and device</li>
        <li>Any error messages you saw</li>
      </ul>
    `,
    tags: ['troubleshooting', 'problems', 'help', 'errors', 'bugs'],
    sort_order: 1,
    is_published: true,
    read_time_minutes: 5,
  },
  {
    category_slug: 'technical-support',
    title: 'Browser and Device Compatibility',
    slug: 'compatibility',
    excerpt: 'Learn which browsers and devices work best with our platform.',
    content: `
      <h2>Browser and Device Compatibility</h2>
      <p>Our platform works on most modern browsers and devices. Here's what you need to know.</p>

      <h3>Recommended Browsers</h3>
      <p>For the best experience, use the latest version of:</p>
      <ul>
        <li><strong>Google Chrome</strong> (recommended)</li>
        <li><strong>Mozilla Firefox</strong></li>
        <li><strong>Safari</strong> (Mac and iOS)</li>
        <li><strong>Microsoft Edge</strong></li>
      </ul>

      <h3>Mobile Devices</h3>
      <p>Fully supported on:</p>
      <ul>
        <li><strong>iOS:</strong> iPhone and iPad with iOS 12 or later</li>
        <li><strong>Android:</strong> Devices running Android 8.0 or later</li>
      </ul>

      <h3>Screen Resolutions</h3>
      <p>Optimized for:</p>
      <ul>
        <li>Desktop: 1280x720 and higher</li>
        <li>Tablet: 768x1024 and higher</li>
        <li>Mobile: 375x667 and higher</li>
      </ul>

      <h3>Required Features</h3>
      <p>Your browser must support:</p>
      <ul>
        <li>JavaScript (must be enabled)</li>
        <li>Cookies (for login and preferences)</li>
        <li>Modern CSS (CSS3)</li>
        <li>HTML5</li>
      </ul>

      <h3>Internet Connection</h3>
      <p>Recommended minimum speeds:</p>
      <ul>
        <li>Browsing: 1 Mbps</li>
        <li>Uploading photos: 5 Mbps</li>
      </ul>

      <h3>Accessibility Features</h3>
      <p>Our platform supports:</p>
      <ul>
        <li>Screen readers</li>
        <li>Keyboard navigation</li>
        <li>Text resizing</li>
        <li>High contrast mode</li>
      </ul>

      <h3>Known Issues</h3>
      <ul>
        <li><strong>Internet Explorer:</strong> No longer supported</li>
        <li><strong>Old Browser Versions:</strong> May have limited functionality</li>
        <li><strong>Ad Blockers:</strong> May interfere with some features</li>
      </ul>

      <h3>Optimizing Performance</h3>
      <p>For the best experience:</p>
      <ul>
        <li>Keep your browser updated</li>
        <li>Close unnecessary tabs and programs</li>
        <li>Clear cache regularly</li>
        <li>Disable unnecessary browser extensions</li>
        <li>Use a stable internet connection</li>
      </ul>
    `,
    tags: ['compatibility', 'browser', 'device', 'requirements', 'technical'],
    sort_order: 2,
    is_published: true,
    read_time_minutes: 4,
  },
  {
    category_slug: 'technical-support',
    title: 'Contact Support',
    slug: 'contact-support',
    excerpt: 'How to get help when you need it.',
    content: `
      <h2>Getting Support</h2>
      <p>Need help that you can't find in our help articles? We're here to assist you.</p>

      <h3>Before Contacting Support</h3>
      <p>Save time by first:</p>
      <ul>
        <li>Searching this help center for your issue</li>
        <li>Checking the troubleshooting guide</li>
        <li>Reviewing relevant help articles in your topic area</li>
        <li>Making sure you've tried basic solutions (refresh, clear cache, etc.)</li>
      </ul>

      <h3>How to Contact Us</h3>
      <p><strong>Contact Form:</strong></p>
      <ol>
        <li>Visit our Contact page</li>
        <li>Fill out the contact form with your details</li>
        <li>Describe your issue clearly</li>
        <li>Submit the form</li>
      </ol>

      <p><strong>Email:</strong></p>
      <p>You can also email us directly at the address provided on our Contact page.</p>

      <h3>What to Include</h3>
      <p>Help us help you faster by including:</p>
      <ul>
        <li>Your account email address</li>
        <li>A clear description of the problem</li>
        <li>What you were trying to do</li>
        <li>What happened instead</li>
        <li>Your browser and device information</li>
        <li>Screenshots if applicable</li>
        <li>Any error messages you received</li>
      </ul>

      <h3>Response Times</h3>
      <ul>
        <li><strong>General inquiries:</strong> 24-48 hours</li>
        <li><strong>Technical issues:</strong> 24-48 hours</li>
        <li><strong>Account issues:</strong> 12-24 hours</li>
        <li><strong>Urgent matters:</strong> Same business day when possible</li>
      </ul>

      <h3>Support Hours</h3>
      <p>Our support team is available:</p>
      <ul>
        <li>Monday - Friday: 9:00 AM - 5:00 PM</li>
        <li>Weekends: Email responses only</li>
        <li>Holidays: Limited availability</li>
      </ul>

      <h3>Other Resources</h3>
      <ul>
        <li><strong>Help Center:</strong> Browse all help articles</li>
        <li><strong>Community Guidelines:</strong> Review platform rules</li>
        <li><strong>Privacy Policy:</strong> Learn about data protection</li>
        <li><strong>Terms of Service:</strong> Understand user agreements</li>
      </ul>
    `,
    tags: ['support', 'contact', 'help', 'customer service'],
    sort_order: 3,
    is_published: true,
    read_time_minutes: 3,
  },
];

async function seedKnowledgeBase() {
  console.log('Starting knowledge base seed...');

  try {
    // Insert categories
    console.log('Inserting categories...');
    const { data: insertedCategories, error: categoryError } = await supabase
      .from('knowledge_base_categories')
      .upsert(categories, { onConflict: 'slug' })
      .select();

    if (categoryError) {
      throw new Error(`Error inserting categories: ${categoryError.message}`);
    }

    console.log(`✓ Inserted ${insertedCategories?.length || 0} categories`);

    // Create a map of category slugs to IDs
    const categoryMap = new Map(
      insertedCategories?.map((cat) => [cat.slug, cat.id]) || []
    );

    // Transform articles to include category IDs
    const articlesWithCategoryIds = articles.map((article) => ({
      ...article,
      category_id: categoryMap.get(article.category_slug),
      category_slug: undefined, // Remove the temporary field
    }));

    // Insert articles
    console.log('Inserting articles...');
    const { data: insertedArticles, error: articleError } = await supabase
      .from('knowledge_base_articles')
      .upsert(articlesWithCategoryIds, { onConflict: 'slug' })
      .select();

    if (articleError) {
      throw new Error(`Error inserting articles: ${articleError.message}`);
    }

    console.log(`✓ Inserted ${insertedArticles?.length || 0} articles`);

    console.log('\n✅ Knowledge base seed completed successfully!');
    console.log(`\nSummary:`);
    console.log(`- Categories: ${insertedCategories?.length || 0}`);
    console.log(`- Articles: ${insertedArticles?.length || 0}`);
  } catch (error) {
    console.error('❌ Error seeding knowledge base:', error);
    process.exit(1);
  }
}

seedKnowledgeBase();
