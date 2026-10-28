// Extracción de texto plano de documentos (PDF/DOCX/TXT), a partir de un buffer
// y del `kind` que detectó lib/documentType.js por magic bytes.
//
// Extraído de services/whatsappBotDocument.service.js (donde nació, para la base
// de conocimiento del bot) para poder reutilizarlo desde la lectura de archivos
// de la Nube del proyecto (projectFiles.controller.js `readFileContent`, que es
// como un agente por MCP lee un brief o un informe ya guardado).
//
// PDF vía pdf-parse v2 (`result.pages` en vez de `result.text` — evita los
// separadores "-- N of M --" que mete el `text` combinado). DOCX vía mammoth
// (`extractRawText`, ignora estilos/formato, solo el contenido). TXT es
// decodificación directa. Puede lanzar (PDF corrupto, DOCX que en realidad es
// otro tipo de ZIP) — siempre lo captura el caller.
async function extractText(buffer, kind) {
  if (kind === 'pdf') {
    const { PDFParse } = require('pdf-parse')
    const parser = new PDFParse({ data: buffer })
    try {
      const result = await parser.getText()
      return result.pages.map(p => p.text).join('\n\n')
    } finally {
      await parser.destroy()
    }
  }
  if (kind === 'docx') {
    const mammoth = require('mammoth')
    const result = await mammoth.extractRawText({ buffer })
    return result.value
  }
  if (kind === 'txt') {
    return buffer.toString('utf8')
  }
  throw new Error('Tipo de documento no soportado')
}

module.exports = { extractText }
