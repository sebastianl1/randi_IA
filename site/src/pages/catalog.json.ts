// Catálogo de modelos en JSON estático (SSG): alimenta el listado con
// scroll infinito de la home (#models). Se genera en build -> /catalog.json.
import { allModels } from '../lib/models.js';
import type { APIRoute } from 'astro';

export const GET: APIRoute = () =>
  new Response(
    JSON.stringify(
      allModels.map((m) => ({
        id: m.id,
        slug: m.slug,
        name: m.name,
        size: m.size || null,
        params: m.paramsBillions ?? null,
        arch: m.architecture || null,
        family: m.family || null,
        provider: m.provider || null,
        useCase: m.useCase || [],
      })),
    ),
    { headers: { 'Content-Type': 'application/json' } },
  );