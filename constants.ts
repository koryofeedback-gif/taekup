
import type { Belt } from './types';

export const COUNTRIES = [
  "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Argentina", "Armenia", "Australia", "Austria", "Azerbaijan",
  "Bahamas", "Bahrain", "Bangladesh", "Barbados", "Belarus", "Belgium", "Belize", "Benin", "Bhutan", "Bolivia", "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei", "Bulgaria", "Burkina Faso", "Burundi",
  "Cabo Verde", "Cambodia", "Cameroon", "Canada", "Central African Republic", "Chad", "Chile", "China", "Colombia", "Comoros", "Congo", "Costa Rica", "Croatia", "Cuba", "Cyprus", "Czech Republic",
  "Denmark", "Djibouti", "Dominica", "Dominican Republic",
  "Ecuador", "Egypt", "El Salvador", "Equatorial Guinea", "Eritrea", "Estonia", "Eswatini", "Ethiopia",
  "Fiji", "Finland", "France",
  "Gabon", "Gambia", "Georgia", "Germany", "Ghana", "Greece", "Grenada", "Guatemala", "Guinea", "Guinea-Bissau", "Guyana",
  "Haiti", "Honduras", "Hungary",
  "Iceland", "India", "Indonesia", "Iran", "Iraq", "Ireland", "Israel", "Italy", "Ivory Coast",
  "Jamaica", "Japan", "Jordan",
  "Kazakhstan", "Kenya", "Kiribati", "Kuwait", "Kyrgyzstan",
  "Laos", "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya", "Liechtenstein", "Lithuania", "Luxembourg",
  "Madagascar", "Malawi", "Malaysia", "Maldives", "Mali", "Malta", "Marshall Islands", "Mauritania", "Mauritius", "Mexico", "Micronesia", "Moldova", "Monaco", "Mongolia", "Montenegro", "Morocco", "Mozambique", "Myanmar",
  "Namibia", "Nauru", "Nepal", "Netherlands", "New Zealand", "Nicaragua", "Niger", "Nigeria", "North Korea", "North Macedonia", "Norway",
  "Oman",
  "Pakistan", "Palau", "Palestine State", "Panama", "Papua New Guinea", "Paraguay", "Peru", "Philippines", "Poland", "Portugal",
  "Qatar",
  "Romania", "Russia", "Rwanda",
  "Saint Kitts and Nevis", "Saint Lucia", "Saint Vincent and the Grendaines", "Samoa", "San Marino", "Sao Tome and Principe", "Saudi Arabia", "Senegal", "Serbia", "Seychelles", "Sierra Leone", "Singapore", "Slovakia", "Slovenia", "Solomon Islands", "Somalia", "South Africa", "South Korea", "South Sudan", "Spain", "Sri Lanka", "Sudan", "Suriname", "Sweden", "Switzerland", "Syria",
  "Taiwan", "Tajikistan", "Tanzania", "Thailand", "Timor-Leste", "Togo", "Tonga", "Trinidad and Tobago", "Tunisia", "Turkey", "Turkmenistan", "Tuvalu",
  "Uganda", "Ukraine", "United Arab Emirates", "United Kingdom", "United States", "Uruguay", "Uzbekistan",
  "Vanuatu", "Vatican City", "Venezuela", "Vietnam",
  "Yemen",
  "Zambia", "Zimbabwe"
];

export const LANGUAGES = [
    "English", "Spanish", "French", "German", "Portuguese", "Italian", "Dutch", "Russian", "Chinese (Simplified)", "Japanese", "Korean", "Arabic", "Persian", "Turkish", "Hindi"
];

// Heuristic map to suggest language based on country
export const COUNTRY_LANGUAGE_MAP: Record<string, string> = {
    "United States": "English", "United Kingdom": "English", "Australia": "English", "Canada": "English",
    "Spain": "Spanish", "Mexico": "Spanish", "Argentina": "Spanish", "Colombia": "Spanish",
    "France": "French", "Belgium": "French", "Senegal": "French",
    "Germany": "German", "Austria": "German", "Switzerland": "German",
    "Brazil": "Portuguese", "Portugal": "Portuguese",
    "Italy": "Italian",
    "Netherlands": "Dutch",
    "Russia": "Russian", "Ukraine": "Russian",
    "China": "Chinese (Simplified)",
    "Japan": "Japanese",
    "South Korea": "Korean",
    "Saudi Arabia": "Arabic", "United Arab Emirates": "Arabic", "Egypt": "Arabic", "Qatar": "Arabic",
    "Iran": "Persian",
    "Turkey": "Turkish",
    "India": "Hindi"
};

// --- BELT SYSTEM CONSTANTS ---

export const WT_BELTS: Belt[] = [
    { id: 'wt-1', name: 'White Belt', color1: '#FFFFFF' },
    { id: 'wt-2', name: 'White/Yellow Stripe', color1: '#FFFFFF', color2: '#FFD700' },
    { id: 'wt-3', name: 'Yellow Belt', color1: '#FFD700' },
    { id: 'wt-4', name: 'Yellow/Green Stripe', color1: '#FFD700', color2: '#008000' },
    { id: 'wt-5', name: 'Green Belt', color1: '#008000' },
    { id: 'wt-6', name: 'Green/Blue Stripe', color1: '#008000', color2: '#0000FF' },
    { id: 'wt-7', name: 'Blue Belt', color1: '#0000FF' },
    { id: 'wt-8', name: 'Blue/Red Stripe', color1: '#0000FF', color2: '#FF0000' },
    { id: 'wt-9', name: 'Red Belt', color1: '#FF0000' },
    { id: 'wt-10', name: 'Red/Black Stripe', color1: '#FF0000', color2: '#000000' },
    { id: 'wt-11', name: 'Black Belt', color1: '#000000' }
];

export const ITF_BELTS: Belt[] = [
    { id: 'itf-1', name: 'White', color1: '#FFFFFF' },
    { id: 'itf-2', name: 'Yellow', color1: '#FFD700' },
    { id: 'itf-3', name: 'Orange', color1: '#FFA500' },
    { id: 'itf-4', name: 'Green', color1: '#008000' },
    { id: 'itf-5', name: 'Blue', color1: '#0000FF' },
    { id: 'itf-6', name: 'Purple', color1: '#800080' },
    { id: 'itf-7', name: 'Brown', color1: '#A52A2A' },
    { id: 'itf-8', name: 'Red', color1: '#FF0000' },
    { id: 'itf-9', name: 'Black', color1: '#000000' }
];

export const KARATE_BELTS: Belt[] = [
    { id: 'k-1', name: 'White', color1: '#FFFFFF' },
    { id: 'k-2', name: 'Yellow', color1: '#FFD700' },
    { id: 'k-3', name: 'Orange', color1: '#FFA500' },
    { id: 'k-4', name: 'Green', color1: '#008000' },
    { id: 'k-5', name: 'Blue', color1: '#0000FF' },
    { id: 'k-6', name: 'Purple', color1: '#800080' },
    { id: 'k-7', name: 'Brown (3rd Kyu)', color1: '#A52A2A' },
    { id: 'k-8', name: 'Brown (2nd Kyu)', color1: '#A52A2A' },
    { id: 'k-9', name: 'Brown (1st Kyu)', color1: '#A52A2A' },
    { id: 'k-10', name: 'Black', color1: '#000000' }
];

export const BJJ_BELTS: Belt[] = [
    { id: 'bjj-1', name: 'White', color1: '#FFFFFF' },
    { id: 'bjj-2', name: 'Blue', color1: '#0000FF' },
    { id: 'bjj-3', name: 'Purple', color1: '#800080' },
    { id: 'bjj-4', name: 'Brown', color1: '#A52A2A' },
    { id: 'bjj-5', name: 'Black', color1: '#000000' },
    { id: 'bjj-6', name: 'Red', color1: '#FF0000' }
];

export const JUDO_BELTS: Belt[] = [
    { id: 'j-1', name: 'White', color1: '#FFFFFF' },
    { id: 'j-2', name: 'Yellow', color1: '#FFD700' },
    { id: 'j-3', name: 'Orange', color1: '#FFA500' },
    { id: 'j-4', name: 'Green', color1: '#008000' },
    { id: 'j-5', name: 'Blue', color1: '#0000FF' },
    { id: 'j-6', name: 'Brown', color1: '#A52A2A' },
    { id: 'j-7', name: 'Black', color1: '#000000' }
];
