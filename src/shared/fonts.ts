// Fonts bundled with the service (all with Cyrillic). Same files are used by the
// browser editor (@font-face) and the server renderer, so text metrics match.
export interface FontDef {
  family: string;
  file: string;
  italicFile?: string;
  category: 'sans' | 'serif' | 'display' | 'condensed' | 'script';
  weights: [number, number]; // variable range
}

export const FONTS: FontDef[] = [
  { family: 'Inter', file: 'Inter.ttf', italicFile: 'Inter-Italic.ttf', category: 'sans', weights: [100, 900] },
  { family: 'Manrope', file: 'Manrope.ttf', category: 'sans', weights: [200, 800] },
  { family: 'Montserrat', file: 'Montserrat.ttf', italicFile: 'Montserrat-Italic.ttf', category: 'sans', weights: [100, 900] },
  { family: 'Roboto', file: 'Roboto.ttf', category: 'sans', weights: [100, 900] },
  { family: 'Open Sans', file: 'OpenSans.ttf', category: 'sans', weights: [300, 800] },
  { family: 'Rubik', file: 'Rubik.ttf', category: 'sans', weights: [300, 900] },
  { family: 'Golos Text', file: 'GolosText.ttf', category: 'sans', weights: [400, 900] },
  { family: 'Onest', file: 'Onest.ttf', category: 'sans', weights: [100, 900] },
  { family: 'Nunito', file: 'Nunito.ttf', category: 'sans', weights: [200, 1000] },
  { family: 'Raleway', file: 'Raleway.ttf', category: 'sans', weights: [100, 900] },
  { family: 'Exo 2', file: 'Exo2.ttf', category: 'sans', weights: [100, 900] },
  { family: 'Comfortaa', file: 'Comfortaa.ttf', category: 'display', weights: [300, 700] },
  { family: 'Unbounded', file: 'Unbounded.ttf', category: 'display', weights: [200, 900] },
  { family: 'Russo One', file: 'RussoOne.ttf', category: 'display', weights: [400, 400] },
  { family: 'Oswald', file: 'Oswald.ttf', category: 'condensed', weights: [200, 700] },
  { family: 'Roboto Condensed', file: 'RobotoCondensed.ttf', category: 'condensed', weights: [100, 900] },
  { family: 'Playfair Display', file: 'PlayfairDisplay.ttf', italicFile: 'PlayfairDisplay-Italic.ttf', category: 'serif', weights: [400, 900] },
  { family: 'Lora', file: 'Lora.ttf', category: 'serif', weights: [400, 700] },
  { family: 'Prata', file: 'Prata.ttf', category: 'serif', weights: [400, 400] },
  // added 2026-11
  { family: 'Mulish', file: 'Mulish.ttf', category: 'sans', weights: [200, 1000] },
  { family: 'Source Sans 3', file: 'SourceSans3.ttf', category: 'sans', weights: [200, 900] },
  { family: 'IBM Plex Sans', file: 'IBMPlexSans.ttf', category: 'sans', weights: [100, 700] },
  { family: 'Noto Sans', file: 'NotoSans.ttf', category: 'sans', weights: [100, 900] },
  { family: 'Commissioner', file: 'Commissioner.ttf', category: 'sans', weights: [100, 900] },
  { family: 'Geologica', file: 'Geologica.ttf', category: 'sans', weights: [100, 900] },
  { family: 'Wix Madefor Display', file: 'WixMadeforDisplay.ttf', category: 'sans', weights: [400, 800] },
  { family: 'Philosopher', file: 'Philosopher.ttf', category: 'sans', weights: [400, 400] },
  { family: 'Cormorant', file: 'Cormorant.ttf', category: 'serif', weights: [300, 700] },
  { family: 'Cormorant Garamond', file: 'CormorantGaramond.ttf', category: 'serif', weights: [300, 700] },
  { family: 'Noto Serif', file: 'NotoSerif.ttf', category: 'serif', weights: [100, 900] },
  { family: 'Literata', file: 'Literata.ttf', category: 'serif', weights: [200, 900] },
  { family: 'Alegreya', file: 'Alegreya.ttf', category: 'serif', weights: [400, 900] },
  { family: 'Forum', file: 'Forum.ttf', category: 'serif', weights: [400, 400] },
  { family: 'Yeseva One', file: 'YesevaOne.ttf', category: 'display', weights: [400, 400] },
  { family: 'Kurale', file: 'Kurale.ttf', category: 'serif', weights: [400, 400] },
  { family: 'Lobster', file: 'Lobster.ttf', category: 'script', weights: [400, 400] },
  { family: 'Pacifico', file: 'Pacifico.ttf', category: 'script', weights: [400, 400] },
  { family: 'Great Vibes', file: 'GreatVibes.ttf', category: 'script', weights: [400, 400] },
  { family: 'Bad Script', file: 'BadScript.ttf', category: 'script', weights: [400, 400] },
  { family: 'Caveat', file: 'Caveat.ttf', category: 'script', weights: [400, 700] },
  { family: 'Amatic SC', file: 'AmaticSC.ttf', category: 'script', weights: [400, 400] },
];

export const FONT_CATEGORIES: Record<FontDef['category'], string> = {
  sans: 'Без засічок',
  serif: 'З засічками',
  display: 'Акцентні',
  condensed: 'Вузькі',
  script: 'Рукописні',
};
