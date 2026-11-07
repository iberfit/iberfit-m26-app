/**
 * The optional Coach capture surface is a collapsed tool inside the existing
 * builder, never a second plan editor, publication path or credentialed API.
 */
export function renderCoachCaptureSurface(){
  return '<details class="m26-panel m26-panel-soft m26-builder-capture" data-session-capture>'+
    '<summary><span><small>Entrada asistida · opcional</small><strong>Importar notas de entrenamiento</strong></span><span aria-hidden="true">⌄</span></summary>'+
    '<div class="m26-capture-body"><p>Pega ejercicios escritos. Tú confirmas cada equivalencia y revisas la prescripción antes de publicar.</p>'+
    '<label for="m26-capture-notes">Un ejercicio por línea<textarea id="m26-capture-notes" data-session-capture-input maxlength="4000" rows="5" spellcheck="false" autocomplete="off" '+
    'placeholder="3 × 10 Sentadilla goblet · 12 kg por mancuerna · descanso 60 s&#10;Remo TRX 3 × 12 · RPE 7&#10;Plancha 3 × 30 s"></textarea></label>'+
    '<p class="m26-field-help">Series × repeticiones o segundos, carga con kg total/por mancuerna, descanso, RPE y RIR separados por “·”. Sin fotos, audio ni servicios externos.</p>'+
    '<button type="button" data-session-action="capture-parse">Interpretar notas</button>'+
    '<div data-session-capture-feedback role="status" aria-live="polite"></div><div data-session-capture-preview></div></div></details>';
}
