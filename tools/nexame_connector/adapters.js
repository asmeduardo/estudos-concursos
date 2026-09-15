/* Adaptadores de fontes. O núcleo da extensão não depende da estrutura de uma plataforma. */
globalThis.NexameAdapters = {
  tec: {
    platform: 'tec',
    matches: (host) => /(^|\.)tecconcursos\.com\.br$/i.test(host),
    cadernoPath: /\/questoes\/cadernos\//i,
    id: (url, index) => ((url.match(/cadernos\/(\d+)/i) || [])[1] || `tec-${index}`),
    links: 'a[href*="/questoes/cadernos/"]'
  },
  qconcursos: {
    platform: 'qconcursos',
    matches: (host) => /(^|\.)qconcursos\.com$/i.test(host),
    cadernoPath: /\/cadernos?\b|\/questoes-de-concursos\//i,
    id: (url, index) => ((url.match(/(?:cadernos?|questoes)\/(\d+|[a-z0-9-]{6,})/i) || [])[1] || `qconcursos-${index}`),
    links: 'a[href*="caderno"],a[href*="questoes-de-concursos"]'
  }
};
