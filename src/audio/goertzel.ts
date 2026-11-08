/** Frequency of a MIDI note (A4 = 69 = 440 Hz). */
export const midiToFreq = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);
