// Fonts bundled with the service (all with Cyrillic). Same files are used by the
// browser editor (@font-face) and the server renderer, so text metrics match.
export interface FontDef {
  family: string;
  file: string;
  italicFile?: string;
  category: 'sans' | 'serif' | 'display' | 'condensed';
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
];
