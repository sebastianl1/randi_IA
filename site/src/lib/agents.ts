// Catálogo de "Agentes IA" (marketplace RANDI Workspace).
// Ejemplos públicos; la versión completa se vende por cotización e
// instalación en el workspace del cliente. Edita/agrega tus agentes aquí.

export type AgentCategory = 'imagen' | 'documentos' | 'cad' | 'codigo' | 'educacion' | 'otros';
export type AgentVersion = 'demo' | 'profesional' | 'enterprise';

export interface Agent {
  id: string;
  nombre: string;
  categoria: AgentCategory;
  desc: string;
  tags: string[];
  version: AgentVersion;
  estado: 'ejemplo' | 'disponible';
}

export const agents: Agent[] = [
  {
    id: 'clasificador-facturas',
    nombre: 'Clasificador de facturas',
    categoria: 'documentos',
    desc: 'Clasifica y resume documentos de facturación (proveedores, montos, fechas) en español.',
    tags: ['documentos', 'OCR', 'español'],
    version: 'profesional',
    estado: 'ejemplo',
  },
  {
    id: 'faq-documental',
    nombre: 'Chat FAQ documental',
    categoria: 'documentos',
    desc: 'Responde preguntas sobre los documentos propios de una empresa sin enviarlos a la nube.',
    tags: ['FAQ', 'RAG', 'PYME'],
    version: 'profesional',
    estado: 'ejemplo',
  },
  {
    id: 'asistente-contenidos-es',
    nombre: 'Asistente de contenidos en español',
    categoria: 'otros',
    desc: 'Redacción y adaptación de contenidos en español, con tono de marca.',
    tags: ['redacción', 'marketing', 'español'],
    version: 'enterprise',
    estado: 'ejemplo',
  },
  {
    id: 'generador-planos-cad',
    nombre: 'Generador de planos asistido (CAD)',
    categoria: 'cad',
    desc: 'Asistencia para generar y organizar planos técnicos y anotaciones de diseño.',
    tags: ['CAD', 'diseño', 'técnico'],
    version: 'enterprise',
    estado: 'ejemplo',
  },
  {
    id: 'agente-codigo',
    nombre: 'Agente de código',
    categoria: 'codigo',
    desc: 'Refactoriza, revisa y genera código dentro del workspace.',
    tags: ['código', 'refactor', 'dev'],
    version: 'demo',
    estado: 'ejemplo',
  },
  {
    id: 'tutor-matematicas',
    nombre: 'Tutor de matemáticas',
    categoria: 'educacion',
    desc: 'Explica y practica ejercicios de matemáticas paso a paso.',
    tags: ['educación', 'matemáticas', 'tutor'],
    version: 'demo',
    estado: 'ejemplo',
  },
];

export const categoriaLabelEs: Record<AgentCategory, string> = {
  imagen: 'Imagen',
  documentos: 'Documentos',
  cad: 'Diseño / CAD',
  codigo: 'Código',
  educacion: 'Educación',
  otros: 'Otros',
};

export const categoriaLabelEn: Record<AgentCategory, string> = {
  imagen: 'Image',
  documentos: 'Documents',
  cad: 'Design / CAD',
  codigo: 'Code',
  educacion: 'Education',
  otros: 'Other',
};

export const versionLabelEs: Record<AgentVersion, string> = {
  demo: 'Demo gratis',
  profesional: 'Profesional',
  enterprise: 'Enterprise',
};

export const versionLabelEn: Record<AgentVersion, string> = {
  demo: 'Free demo',
  profesional: 'Professional',
  enterprise: 'Enterprise',
};