// voice.js — ditado por voz para preencher o campo de endereço.
// Usa a Web Speech API nativa do navegador (gratuita, sem servidor).
// Suporte real hoje: Chrome/Edge no Android e no desktop. Safari/iOS tem
// suporte parcial ou ausente — por isso sempre testamos a disponibilidade
// antes de mostrar o botão de microfone como ativo.

export function speechSupported() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

/**
 * Cria um reconhecedor de voz configurado em português do Brasil.
 * @param {Object} handlers
 * @param {(text:string)=>void} handlers.onInterim  chamado a cada trecho parcial (vai completando o campo)
 * @param {(text:string)=>void} handlers.onFinal    chamado quando uma frase é finalizada
 * @param {()=>void}            handlers.onStart
 * @param {()=>void}            handlers.onEnd
 * @param {(err:any)=>void}     handlers.onError
 */
export function createRecognizer({ onInterim, onFinal, onStart, onEnd, onError } = {}) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;

  const rec = new SR();
  rec.lang = "pt-BR";
  rec.continuous = false;
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  rec.onstart = () => onStart && onStart();
  rec.onend = () => onEnd && onEnd();
  rec.onerror = (e) => onError && onError(e);

  rec.onresult = (event) => {
    let interim = "";
    let final = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) final += transcript;
      else interim += transcript;
    }
    if (interim && onInterim) onInterim(interim);
    if (final && onFinal) onFinal(final);
  };

  return rec;
}