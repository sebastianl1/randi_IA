// Catálogo de "Redes neuronales a medida" (escaparate público).
// Aquí se presentan ejemplos; la versión completa se vende por cotización.
// Edita/agrega tu red siguiendo el mismo formato (los ejemplos actuales son
// placeholders para que luego pongas tus redes reales).

export type NetworkCategory = 'imagen' | 'documentos' | 'cad' | 'codigo' | 'educacion' | 'otros';

export interface Network {
  id: string;
  nombre: string;
  categoria: NetworkCategory;
  desc: string;
  tags: string[];
  estado: 'ejemplo' | 'disponible';
}

export const networks: Network[] = [
  {
    id: 'clasificador-facturas',
    nombre: 'Clasificador de facturas',
    categoria: 'documentos',
    desc: 'Clasifica y resume documentos de facturación (proveedores, montos, fechas) en español.',
    tags: ['documentos', 'OCR', 'español'],
    estado: 'ejemplo',
  },
  {
    id: 'faq-documental',
    nombre: 'Chat FAQ documental',
    categoria: 'documentos',
    desc: 'Responde preguntas sobre los documentos propios de una empresa sin enviarlos a la nube.',
    tags: ['FAQ', 'RAG', 'PYME'],
    estado: 'ejemplo',
  },
  {
    id: 'asistente-contenidos-es',
    nombre: 'Asistente de contenidos en español',
    categoria: 'otros',
    desc: 'Redacción y adaptación de contenidos en español rioplatense y andino, con tono de marca.',
    tags: ['redacción', 'marketing', 'español'],
    estado: 'ejemplo',
  },
  {
    id: 'generador-planos-cad',
    nombre: 'Generador de planos asistido (CAD)',
    categoria: 'cad',
    desc: 'Asistencia para generar y organizar planos técnicos y anotaciones de diseño.',
    tags: ['CAD', 'diseño', 'técnico'],
    estado: 'ejemplo',
  },
];

export const categoriaLabelEs: Record<NetworkCategory, string> = {
  imagen: 'Imagen',
  documentos: 'Documentos',
  cad: 'Diseño / CAD',
  codigo: 'Código',
  educacion: 'Educación',
  otros: 'Otros',
};

export const categoriaLabelEn: Record<NetworkCategory, string> = {
  imagen: 'Image',
  documentos: 'Documents',
  cad: 'Design / CAD',
  codigo: 'Code',
  educacion: 'Education',
  otros: 'Other',
};