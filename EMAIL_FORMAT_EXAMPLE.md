# Plain Text Email Format - Example

## What the email will look like:

```
Here are the latest apartments posted on Hadirot:

To see all 80+ active apartments:
https://hadirot.com/browse

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

$2,500
2 bed | 1 bath | Parking | No Fee
Williamsburg, Brooklyn
Posted by Owner
https://hadirot.com/l/abc123

$3,200
Studio | 1 bath | No Fee - Full House
Greenpoint, Brooklyn
Posted by Brooklyn Realty
https://hadirot.com/l/def456

$1,800
3 bed | 2 bath | Parking | Broker Fee - Short Term
Crown Heights, Brooklyn
Posted by Owner (FEATURED)
https://hadirot.com/l/ghi789

$2,100
1 bed | 1 bath | No Fee - Duplex
Park Slope, Brooklyn
Posted by Park Slope Rentals
https://hadirot.com/l/jkl012

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Join the Hadirot WhatsApp Community:
https://chat.whatsapp.com/C3qmgo7DNOI63OE0RAZRgt
```

## Key Changes Made:

### 1. ✅ Pure Plain Text
- No HTML, no styles, no backgrounds
- Just clean text that copies perfectly to WhatsApp
- Wrapped in minimal `<pre>` tag for email clients

### 2. ✅ Removed "📋 X New Listings" Header
- Completely removed the count header line
- Email goes straight into listings after the intro

### 3. ✅ Property Type Display Logic
**For Apartments (most common):**
- Nothing shown (no "Apartment" text)
- Example: `2 bed | 1 bath | No Fee`

**For Full House:**
- Shows after "No Fee"
- Example: `2 bed | 1 bath | No Fee - Full House`

**For Duplex:**
- Shows after "No Fee"
- Example: `1 bed | 1 bath | No Fee - Duplex`

**For Short Term lease:**
- Shows after fee info
- Example: `3 bed | 2 bath | Broker Fee - Short Term`

**Combinations:**
- Can show both: `2 bed | 1 bath | No Fee - Full House, Short Term`

### 4. ✅ URL Text (Not Hyperlinks)
- Plain URL text shown: `https://hadirot.com/l/abc123`
- No "View listing:" prefix
- Perfect for copy-paste to WhatsApp
- URLs still clickable in email clients but show as plain text

### 5. ✅ Clean Formatting
- Uses spacing and line breaks for readability
- Uses Unicode box-drawing characters (━) for dividers
- No styled sections or backgrounds
- Easy to read and copy

## How Different Listings Appear:

### Standard Apartment (12 months)
```
$2,500
2 bed | 1 bath | No Fee
Williamsburg, Brooklyn
Posted by Owner
https://hadirot.com/l/abc123
```

### Full House
```
$3,500
4 bed | 2 bath | Parking | Broker Fee - Full House
Borough Park, Brooklyn
Posted by BP Realty
https://hadirot.com/l/xyz789
```

### Short Term Apartment
```
$3,000
1 bed | 1 bath | No Fee - Short Term
Midwood, Brooklyn
Posted by Owner
https://hadirot.com/l/mno345
```

### Duplex with Short Term
```
$2,800
2 bed | 1.5 bath | Parking | No Fee - Duplex, Short Term
Flatbush, Brooklyn
Posted by Flatbush Homes
https://hadirot.com/l/pqr678
```

### Studio Full House
```
$2,000
Studio | 1 bath | No Fee - Full House
Bensonhurst, Brooklyn
Posted by Owner
https://hadirot.com/l/stu901
```

## Copy-Paste Ready

The entire email can be copied and pasted directly into WhatsApp and will maintain its formatting. All URLs are plain text so they're easily shareable.
