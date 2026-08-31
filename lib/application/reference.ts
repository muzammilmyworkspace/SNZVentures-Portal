/**
 * REFERENCE LISTS FOR THE STUDENT APPLICATION.
 * ---------------------------------------------------------------------------
 * The country names are DreamApply's own list, in DreamApply's spelling. That
 * matters more than it looks: the application is retyped into their system,
 * and "Turkey" where they expect "Türkiye", or "Ivory Coast" for "Côte
 * d'Ivoire", is a value their importer drops on the floor. Do not tidy these.
 *
 * They are held here rather than inline in the form definition because a
 * 200-item array repeated in nine selects is 1,800 lines of the same list.
 */

export const COUNTRIES: readonly string[] = [
  "Afghanistan", "Åland Islands", "Albania", "Algeria", "American Samoa", "Andorra",
  "Angola", "Anguilla", "Antigua & Barbuda", "Argentina", "Armenia", "Aruba",
  "Australia", "Austria", "Azerbaijan", "Bahamas", "Bahrain", "Bangladesh",
  "Barbados", "Belarus", "Belgium", "Belize", "Benin", "Bermuda", "Bhutan",
  "Bolivia", "Bosnia & Herzegovina", "Botswana", "Brazil", "British Virgin Islands",
  "Brunei", "Bulgaria", "Burkina Faso", "Burundi", "Cambodia", "Cameroon", "Canada",
  "Cape Verde", "Caribbean Netherlands", "Cayman Islands", "Central African Republic",
  "Chad", "Chile", "China", "Colombia", "Comoros", "Congo - Brazzaville",
  "Congo - Kinshasa", "Cook Islands", "Costa Rica", "Côte d’Ivoire", "Croatia",
  "Cuba", "Curaçao", "Cyprus", "Cyprus (North)", "Czechia", "Denmark", "Djibouti",
  "Dominica", "Dominican Republic", "Ecuador", "Egypt", "El Salvador",
  "Equatorial Guinea", "Eritrea", "Estonia", "Eswatini", "Ethiopia",
  "Falkland Islands", "Faroe Islands", "Fiji", "Finland", "France", "French Guiana",
  "French Polynesia", "Gabon", "Gambia", "Georgia", "Germany", "Ghana", "Gibraltar",
  "Greece", "Greenland", "Grenada", "Guadeloupe", "Guam", "Guatemala", "Guernsey",
  "Guinea", "Guinea-Bissau", "Guyana", "Haiti", "Honduras", "Hong Kong SAR China",
  "Hungary", "Iceland", "India", "Indonesia", "Iran", "Iraq", "Ireland",
  "Isle of Man", "Israel", "Italy", "Jamaica", "Japan", "Jersey", "Jordan",
  "Kazakhstan", "Kenya", "Kiribati", "Kosovo", "Kuwait", "Kyrgyzstan", "Laos",
  "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya", "Liechtenstein", "Lithuania",
  "Luxembourg", "Macao SAR China", "Madagascar", "Malawi", "Malaysia", "Maldives",
  "Mali", "Malta", "Marshall Islands", "Martinique", "Mauritania", "Mauritius",
  "Mayotte", "Mexico", "Micronesia", "Moldova", "Monaco", "Mongolia", "Montenegro",
  "Montserrat", "Morocco", "Mozambique", "Myanmar (Burma)", "Namibia", "Nauru",
  "Nepal", "Netherlands", "New Caledonia", "New Zealand", "Nicaragua", "Niger",
  "Nigeria", "Niue", "North Korea", "North Macedonia", "Northern Mariana Islands",
  "Norway", "Oman", "Pakistan", "Palau", "Palestine", "Panama", "Papua New Guinea",
  "Paraguay", "Peru", "Philippines", "Poland", "Portugal", "Puerto Rico", "Qatar",
  "Réunion", "Romania", "Russia", "Rwanda", "Samoa", "San Marino",
  "São Tomé & Príncipe", "Saudi Arabia", "Senegal", "Serbia", "Seychelles",
  "Sierra Leone", "Singapore", "Sint Maarten", "Slovakia", "Slovenia",
  "Solomon Islands", "Somalia", "South Africa", "South Korea", "South Sudan",
  "Spain", "Sri Lanka", "St Barthélemy", "St Helena", "St Kitts & Nevis",
  "St Lucia", "St Martin", "St Pierre & Miquelon", "St Vincent & the Grenadines",
  "Sudan", "Suriname", "Svalbard & Jan Mayen", "Sweden", "Switzerland", "Syria",
  "Taiwan", "Tajikistan", "Tanzania", "Thailand", "Timor-Leste", "Togo", "Tokelau",
  "Tonga", "Trinidad & Tobago", "Tunisia", "Türkiye", "Turkmenistan",
  "Turks & Caicos Islands", "Tuvalu", "Uganda", "Ukraine", "United Arab Emirates",
  "United Kingdom", "United States", "Uruguay", "US Virgin Islands", "Uzbekistan",
  "Vanuatu", "Vatican City", "Venezuela", "Vietnam", "Wallis & Futuna",
  "Western Sahara", "Yemen", "Zambia", "Zimbabwe",
];

export const LANGUAGES: readonly string[] = [
  "English", "Urdu", "Punjabi", "Sindhi", "Pashto", "Balochi", "Saraiki", "Hindi",
  "Bengali", "Nepali", "Arabic", "Persian", "Turkish", "Chinese (Mandarin)",
  "French", "German", "Spanish", "Portuguese", "Italian", "Dutch", "Russian",
  "Ukrainian", "Polish", "Lithuanian", "Latvian", "Estonian", "Czech", "Slovak",
  "Hungarian", "Romanian", "Bulgarian", "Greek", "Swedish", "Norwegian", "Danish",
  "Finnish", "Serbian", "Croatian", "Albanian", "Somali", "Swahili", "Amharic",
  "Yoruba", "Hausa", "Igbo", "Tamil", "Telugu", "Malayalam", "Gujarati", "Marathi",
  "Sinhala", "Indonesian", "Malay", "Filipino/Tagalog", "Vietnamese", "Thai",
  "Japanese", "Korean", "Hebrew", "Kurdish", "Azerbaijani", "Uzbek", "Kazakh",
  "Georgian", "Armenian", "Other",
];

/** Country → international dialling code, for the phone prefix. */
export const DIAL_CODES: Readonly<Record<string, string>> = {
  Pakistan: "+92", India: "+91", Bangladesh: "+880", Nepal: "+977",
  "Sri Lanka": "+94", "United Arab Emirates": "+971", "Saudi Arabia": "+966",
  Qatar: "+974", Kuwait: "+965", Oman: "+968", Bahrain: "+973", Egypt: "+20",
  Jordan: "+962", Lebanon: "+961", Iraq: "+964", Iran: "+98", "Türkiye": "+90",
  Nigeria: "+234", Ghana: "+233", Kenya: "+254", Morocco: "+212",
  Lithuania: "+370", Latvia: "+371", Estonia: "+372", Poland: "+48",
  Germany: "+49", Netherlands: "+31", France: "+33", Spain: "+34", Italy: "+39",
  Hungary: "+36", Czechia: "+420", Slovakia: "+421", Romania: "+40",
  Bulgaria: "+359", Portugal: "+351", Ireland: "+353", Sweden: "+46",
  Denmark: "+45", Finland: "+358", Norway: "+47", Belgium: "+32", Austria: "+43",
  Greece: "+30", Croatia: "+385", Slovenia: "+386", Cyprus: "+357", Malta: "+356",
  "United Kingdom": "+44", "United States": "+1", Canada: "+1", Australia: "+61",
  China: "+86", Malaysia: "+60", Indonesia: "+62", Philippines: "+63",
  Uzbekistan: "+998", Kazakhstan: "+7", Azerbaijan: "+994",
};

export const DESTINATIONS: readonly string[] = [
  "Lithuania", "Latvia", "Poland", "Hungary", "Germany", "Estonia", "Czechia",
  "Netherlands", "Spain", "Italy", "Open to any EU country",
];

export const EDUCATION_LEVELS: readonly string[] = [
  "Secondary education (Matric / SSC / O-Levels)",
  "Upper secondary (Intermediate / HSSC / A-Levels)",
  "Diploma / associate degree",
  "Bachelor's degree",
  "Master's degree",
  "Doctoral degree",
];

export const LANGUAGE_LEVELS: readonly string[] = [
  "A1 — beginner",
  "A2 — elementary",
  "B1 — intermediate",
  "B2 — upper intermediate",
  "C1 — advanced",
  "C2 — proficient",
  "Native",
];
