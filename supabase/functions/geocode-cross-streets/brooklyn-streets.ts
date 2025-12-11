export const BROOKLYN_NUMBERED_STREETS = {
  east: Array.from({ length: 108 }, (_, i) => i + 1),
  west: Array.from({ length: 37 }, (_, i) => i + 1),
};

export const BROOKLYN_LETTERED_AVENUES = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
  'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'
];

export const BROOKLYN_NAMED_STREETS: Record<string, string[]> = {
  'Kings Highway': ['kings hwy', 'kings highwy', 'kingshighway', 'king highway', 'kings hi way'],
  'Ocean Parkway': ['ocean pkwy', 'ocean pky', 'oceanparkway', 'ocean parkwy'],
  'Ocean Avenue': ['ocean ave', 'ocean av', 'oceanavenue', 'oceanave'],
  'McDonald Avenue': ['mcdonald ave', 'mcdonalds ave', 'mcdonald av', 'mcdonaldavenue', 'mc donald ave'],
  'Nostrand Avenue': ['nostrand ave', 'nostrand av', 'nostrandavenue', 'nostrandave'],
  'Coney Island Avenue': ['coney island ave', 'coney island av', 'coneyislandavenue', 'coney ave'],
  'Flatbush Avenue': ['flatbush ave', 'flatbush av', 'flatbushavenue', 'flatbushave'],
  'Atlantic Avenue': ['atlantic ave', 'atlantic av', 'atlanticavenue', 'atlanticave'],
  'Eastern Parkway': ['eastern pkwy', 'eastern pky', 'easternparkway', 'eastern parkwy'],
  'Shore Parkway': ['shore pkwy', 'shore pky', 'shoreparkway', 'shore road pkwy'],
  'Bay Parkway': ['bay pkwy', 'bay pky', 'bayparkway'],
  'Fort Hamilton Parkway': ['fort hamilton pkwy', 'ft hamilton pkwy', 'forthamiltonparkway', 'ft hamilton parkway'],
  'Cortelyou Road': ['cortelyou rd', 'cortelyou', 'cortelyouroad'],
  'Church Avenue': ['church ave', 'church av', 'churchavenue', 'churchave'],
  'Beverly Road': ['beverly rd', 'beverlyroad', 'beverly'],
  'Albemarle Road': ['albemarle rd', 'albemarleroad', 'albemarle'],
  'Ditmas Avenue': ['ditmas ave', 'ditmas av', 'ditmasavenue'],
  'Newkirk Avenue': ['newkirk ave', 'newkirk av', 'newkirkavenue'],
  'Foster Avenue': ['foster ave', 'foster av', 'fosteravenue'],
  'Farragut Road': ['farragut rd', 'farragutroad', 'farragut'],
  'Glenwood Road': ['glenwood rd', 'glenwoodroad', 'glenwood'],
  'Avenue H': ['ave h', 'avenue h'],
  'Avenue I': ['ave i', 'avenue i'],
  'Avenue J': ['ave j', 'avenue j'],
  'Avenue K': ['ave k', 'avenue k'],
  'Avenue L': ['ave l', 'avenue l'],
  'Avenue M': ['ave m', 'avenue m'],
  'Avenue N': ['ave n', 'avenue n'],
  'Avenue O': ['ave o', 'avenue o'],
  'Avenue P': ['ave p', 'avenue p'],
  'Avenue R': ['ave r', 'avenue r'],
  'Avenue S': ['ave s', 'avenue s'],
  'Avenue T': ['ave t', 'avenue t'],
  'Avenue U': ['ave u', 'avenue u'],
  'Avenue V': ['ave v', 'avenue v'],
  'Avenue W': ['ave w', 'avenue w'],
  'Avenue X': ['ave x', 'avenue x'],
  'Avenue Y': ['ave y', 'avenue y'],
  'Avenue Z': ['ave z', 'avenue z'],
  'Bedford Avenue': ['bedford ave', 'bedford av', 'bedfordavenue'],
  'Utica Avenue': ['utica ave', 'utica av', 'uticaavenue'],
  'Ralph Avenue': ['ralph ave', 'ralph av', 'ralphavenue'],
  'Rockaway Parkway': ['rockaway pkwy', 'rockaway pky', 'rockawayparkway'],
  'Remsen Avenue': ['remsen ave', 'remsen av', 'remsenavenue'],
  'East New York Avenue': ['east new york ave', 'e new york ave', 'eastnewworkavenue'],
  'Linden Boulevard': ['linden blvd', 'linden bvd', 'lindenboulevard'],
  'Pennsylvania Avenue': ['pennsylvania ave', 'penn ave', 'pennsylvaniaavenue'],
  'Livonia Avenue': ['livonia ave', 'livonia av', 'livoniaavenue'],
  'Sutter Avenue': ['sutter ave', 'sutter av', 'sutteravenue'],
  'Blake Avenue': ['blake ave', 'blake av', 'blakeavenue'],
  'Dumont Avenue': ['dumont ave', 'dumont av', 'dumontavenue'],
  'New Lots Avenue': ['new lots ave', 'newlots ave', 'newlotsavenue'],
  'Stanley Avenue': ['stanley ave', 'stanley av', 'stanleyavenue'],
  'Flatlands Avenue': ['flatlands ave', 'flatlands av', 'flatlandsavenue'],
  'Tilden Avenue': ['tilden ave', 'tilden av', 'tildenavenue'],
  'Clarkson Avenue': ['clarkson ave', 'clarkson av', 'clarksonavenue'],
  'Winthrop Street': ['winthrop st', 'winthrop street', 'winthropstreet'],
  'Parkside Avenue': ['parkside ave', 'parkside av', 'parksideavenue'],
  'Lincoln Road': ['lincoln rd', 'lincoln road', 'lincolnroad'],
  'Lefferts Avenue': ['lefferts ave', 'lefferts av', 'leffertsavenue'],
  'Maple Street': ['maple st', 'maple street', 'maplestreet'],
  'Midwood Street': ['midwood st', 'midwood street', 'midwoodstreet'],
  'Rutland Road': ['rutland rd', 'rutland road', 'rutlandroad'],
  'Fenimore Street': ['fenimore st', 'fenimore street', 'fenimorestreet'],
  'Hawthorne Street': ['hawthorne st', 'hawthorne street', 'hawthornestreet'],
  'Lenox Road': ['lenox rd', 'lenox road', 'lenoxroad'],
  'Martense Street': ['martense st', 'martense street', 'martensestreet'],
  'Church Lane': ['church ln', 'church lane', 'churchlane'],
  'Snyder Avenue': ['snyder ave', 'snyder av', 'snyderavenue'],
  '86th Street': ['86th st', '86 st', '86 street', '86thstreet'],
  'Bay Ridge Avenue': ['bay ridge ave', 'bayridge ave', 'bay ridge av'],
  'Fourth Avenue': ['4th ave', '4th avenue', 'fourth ave', '4 ave'],
  'Fifth Avenue': ['5th ave', '5th avenue', 'fifth ave', '5 ave'],
  'Sixth Avenue': ['6th ave', '6th avenue', 'sixth ave', '6 ave'],
  'Seventh Avenue': ['7th ave', '7th avenue', 'seventh ave', '7 ave'],
  'Eighth Avenue': ['8th ave', '8th avenue', 'eighth ave', '8 ave'],
  'Ninth Avenue': ['9th ave', '9th avenue', 'ninth ave', '9 ave'],
  'Tenth Avenue': ['10th ave', '10th avenue', 'tenth ave', '10 ave'],
  'New Utrecht Avenue': ['new utrecht ave', 'newutrecht ave', 'new utrecht av'],
  'Dahill Road': ['dahill rd', 'dahill road', 'dahillroad'],
  'Eighteenth Avenue': ['18th ave', '18th avenue', 'eighteenth ave', '18 ave'],
  'Thirteenth Avenue': ['13th ave', '13th avenue', 'thirteenth ave', '13 ave'],
  'Sixteenth Avenue': ['16th ave', '16th avenue', 'sixteenth ave', '16 ave'],
};

export const COMMON_MISSPELLINGS: Record<string, string> = {
  'avenu': 'avenue',
  'aveneu': 'avenue',
  'avenuw': 'avenue',
  'stret': 'street',
  'streat': 'street',
  'steeet': 'street',
  'parkwy': 'parkway',
  'parkwa': 'parkway',
  'boulavard': 'boulevard',
  'boulvard': 'boulevard',
  'boulevar': 'boulevard',
  'highwy': 'highway',
  'highwa': 'highway',
  'norstrand': 'nostrand',
  'nostran': 'nostrand',
  'flatbsh': 'flatbush',
  'flatbsuh': 'flatbush',
  'mcdonalds': 'mcdonald',
  'macdonald': 'mcdonald',
  'cortelyo': 'cortelyou',
  'cortelyuo': 'cortelyou',
  'albamarle': 'albemarle',
  'albemerle': 'albemarle',
  'beberly': 'beverly',
  'beverley': 'beverly',
};

export function getAllKnownStreetNames(): string[] {
  const streets: string[] = [];

  for (let i = 1; i <= 108; i++) {
    streets.push(`East ${i}${getOrdinalSuffix(i)} Street`);
  }
  for (let i = 1; i <= 37; i++) {
    streets.push(`West ${i}${getOrdinalSuffix(i)} Street`);
  }

  for (const letter of BROOKLYN_LETTERED_AVENUES) {
    streets.push(`Avenue ${letter}`);
  }

  streets.push(...Object.keys(BROOKLYN_NAMED_STREETS));

  return streets;
}

export function getOrdinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}
