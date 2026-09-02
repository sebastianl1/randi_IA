// RANDI landing — contenido i18n (es/en).

export type OSKey = 'android' | 'linux' | 'macos' | 'windows-wsl' | 'windows-gitbash';

export interface OSGuide {
  key: OSKey;
  label: string;
  intro: string;
  steps: Array<{ title: string; body: string[]; code?: string[] }>;
  after: string[];
}

export interface Landing {
  nav: { models: string; install: string; github: string; chat: string; docs: string; donar: string; marketplace: string; workspace: string };
  arch: { t: string; d: string; cards: Array<{ t: string; d: string; tag: string }> };
  modes: { t: string; d: string; items: Array<{ t: string; d: string; tag: string }> };
  hero: { badge: string; title: string[]; sub: string; cta1: string; cta2: string; stats: string };
  quick: string;
  traza: { t: string; d: string; items: string[] };
  stats: Array<{ v: string; l: string }>;
  what: { title: string; sub: string; cards: Array<{ t: string; d: string; tag: string }> };
  how: { title: string; sub: string; steps: Array<{ t: string; d: string }> };
  install: { title: string; sub: string; guides: OSGuide[]; note: string };
  ecosys: { t: string; d: string; items: Array<{ t: string; d: string; soon: boolean }> };
  features: { title: string; items: string[] };
  faq: Array<{ q: string; a: string }>;
  footer: string;
}

const guidesEs: OSGuide[] = [
  {
    key: 'android',
    label: 'Android · Termux',
    intro: 'Termux es tu terminal de Android. Instala RANDI directo (Requisitos: Android 11+, 4GB RAM, 6GB+ libres).',
    steps: [
      { title: '1. Instala Termux', body: ['Descargalo desde F-Droid (NO desde Google Play, está desactualizado).', 'Abre Termux y actualiza los paquetes.'] },
      { title: '2. Clona e instala RANDI', body: ['Estos comandos instalan herramientas, Ollama (nativo de Termux) y configuran tu shell. El wizard de instalación te guía.'] },
      { title: '3. Onboarding por hardware', body: ['Analiza tu CPU/GPU/RAM y elige los modelos que corren en tu equipo.', `Elige un modelo: se descarga y configura automáticamente, listo para chatear.`] },
      { title: '4. Usa RANDI', body: ['Listo. Sin internet, sin tokens, 100% privado.', 'Puedes abrir `randi web` para la interfaz en el navegador.'] },
    ],
    after: ['Tips: instala `pkg install espeak-ng` para voz y `ollama-backend-vulkan` para acelerar con la GPU Adreno/Mali.'],
  },
  {
    key: 'linux',
    label: 'Linux',
    intro: 'RANDI corre en cualquier distro Linux con bash y Python 3.8+.',
    steps: [
      { title: '1. Requisitos', body: ['4GB de RAM mínimo (8GB+ recomendado). `git`, `curl` y Python 3 disponibles.'] },
      { title: '2. Clona e instala', body: ['Instala dependencias, Ollama (script oficial) y configura la shell.'] },
      { title: '3. Onboarding', body: ['`randi setup` detecta tu GPU (nvidia-smi/rocm-smi) y recomienda modelos.', '`randi install <modelo>` descarga y configura automáticamente.'] },
      { title: '4. Usa RANDI', body: ['Todo desde la terminal: `randi chat` para el chat, `randi web` para la interfaz y `randi img` para imágenes.'] },
    ],
    after: ['NVIDIA/AMD: el motor compat te dice exactamente qué modela corre en tu GPU.'],
  },
  {
    key: 'macos',
    label: 'macOS',
    intro: 'RANDI soporta Apple Silicon (M1–M4) y Mac Intel. Requiere Homebrew.',
    steps: [
      { title: '1. Requisitos', body: ['Homebrew instalado. Apple Silicon aprovecha la memoria unificada en el motor de compatibilidad.'] },
      { title: '2. Clona e instala', body: ['El instalador detecta macOS, instala Ollama con el script oficial y configura la shell + zshrc.'] },
      { title: '3. Onboarding', body: ['`randi setup` clasifica tu Mac como Apple Silicon y calcula cuánta memoria necesitan los modelos.', 'Modelos MoE mid-size (Qwen3-30B-A3B, GPT-OSS 20B) corren muy bien en M-series.'] },
      { title: '4. Usa', body: ['`randi web` abre la interfaz; `randi chat` para el TUI; voz con `pip piper-tts`.'] },
    ],
    after: ['En Apple Silicon el motor usa el 75% de la RAM total como memoria usable unificada.'],
  },
  {
    key: 'windows-wsl',
    label: 'Windows · WSL2',
    intro: 'La opción recomendada en Windows: todo corre dentro de una distro de WSL2.',
    steps: [
      { title: '1. Activa WSL2', body: ['Instala WSL2 (wsl --install) y una distro (Ubuntu). Abre la terminal de WSL.'] },
      { title: '2. Clona e instala', body: ['Dentro de WSL: `sudo apt-get update && sudo apt-get install -y git`, cloná y ejecutá el instalador.'] },
      { title: '3. Onboarding y uso', body: ['`randi setup` detecta hardware dentro de la VM.', 'Igual que Linux: `randi install <modelo>` y `randi chat`.'] },
    ],
    after: ['GPU en WSL2: NVIDIA tiene soporte CUDA directo para Ollama.'],
  },
  {
    key: 'windows-gitbash',
    label: 'Windows · Nativo (npm)',
    intro: 'Instalacion NATIVA en Windows (sin WSL y sin Git Bash): solo Node, Python y Ollama (servicio) instalados por winget.',
    steps: [
      { title: '1. Requisitos', body: ['Node.js 18+. Python y Ollama se instalan solos por winget (nativo).', 'Ollama corre como servicio de Windows y RANDI lo detecta.'] },
      { title: '2. Instala el paquete', body: ['Instala RANDI global (o ejecutalo sin instalar con npx).', '`randi ensure` verifica/instala Python y Ollama por winget si faltan.'] },
      { title: '3. Onboarding y uso', body: ['`randi setup` analiza tu GPU/VRAM y recomienda modelos.', '`randi install <modelo>`, `randi chat` y `randi web` funcionan directo en PowerShell.'] },
    ],
    after: ['Sin WSL y sin Git Bash: corre 100% nativo (Python winget + Ollama servicio).'],
  },
];

const guidesEn: OSGuide[] = [
  {
    key: 'android',
    label: 'Android · Termux',
    intro: 'Termux is your Android terminal. Install RANDI directly (Requires Android 11+, 4GB RAM, 6GB+ free).',
    steps: [
      { title: '1. Install Termux', body: ['Get it from F-Droid (NOT Google Play, it is outdated).', 'Open Termux and update packages.'] },
      { title: '2. Clone & install RANDI', body: ['These commands install tools, Ollama (Termux native) and configure your shell. The wizard guides you.'] },
      { title: '3. Hardware onboarding', body: ['It analyzes your CPU/GPU/RAM and picks models that run on your device.', 'Pick a model: it downloads and configures automatically, ready to chat.'] },
      { title: '4. Use RANDI', body: ['Done. No internet, no tokens, 100% private.', 'Run `randi web` for the browser UI.'] },
    ],
    after: ['Tips: install `pkg install espeak-ng` for voice and `ollama-backend-vulkan` to speed up on Adreno/Mali GPUs.'],
  },
  {
    key: 'linux',
    label: 'Linux',
    intro: 'RANDI runs on any Linux distro with bash and Python 3.8+.',
    steps: [
      { title: '1. Requirements', body: ['4GB RAM minimum (8GB+ recommended). git, curl and Python 3 available.'] },
      { title: '2. Clone & install', body: ['Installs dependencies, Ollama (official script) and configures the shell.'] },
      { title: '3. Onboarding', body: ['`randi setup` detects your GPU (nvidia-smi/rocm-smi) and recommends models.', '`randi install <model>` downloads and configures automatically.'] },
      { title: '4. Use RANDI', body: ['Everything from the terminal: `randi chat` for chat, `randi web` for the UI and `randi img` for images.'] },
    ],
    after: ['NVIDIA/AMD: the compat engine tells you exactly what fits your GPU.'],
  },
  {
    key: 'macos',
    label: 'macOS',
    intro: 'RANDI supports Apple Silicon (M1–M4) and Intel Mac. Requires Homebrew.',
    steps: [
      { title: '1. Requirements', body: ['Homebrew installed. Apple Silicon leverages unified memory in the compat engine.'] },
      { title: '2. Clone & install', body: ['The installer detects macOS, installs Ollama with the official script and configures your shell + zshrc.'] },
      { title: '3. Onboarding', body: ['`randi setup` classifies your Mac as Apple Silicon and sizes model memory needs.', 'Mid-size MoE models (Qwen3-30B-A3B, GPT-OSS 20B) run great on M-series.'] },
      { title: '4. Use', body: ['`randi web` opens the UI; `randi chat` for the TUI; voice via `pip piper-tts`.'] },
    ],
    after: ['On Apple Silicon the engine uses 75% of total RAM as usable unified memory.'],
  },
  {
    key: 'windows-wsl',
    label: 'Windows · WSL2',
    intro: 'The recommended Windows option: everything runs inside a WSL2 distro.',
    steps: [
      { title: '1. Enable WSL2', body: ['Install WSL2 (wsl --install) and a distro (Ubuntu). Open the WSL terminal.'] },
      { title: '2. Clone & install', body: ['Inside WSL run the install as on Linux: the script sets up Ollama and the shell.'] },
      { title: '3. Onboarding & use', body: ['`randi setup` detects hardware inside the VM.', 'Same as Linux: `randi install <model>` and `randi chat`.'] },
    ],
    after: ['GPU on WSL2: NVIDIA has direct CUDA support for Ollama.'],
  },
  {
    key: 'windows-gitbash',
    label: 'Windows · Native (npm)',
    intro: 'NATIVE install on Windows (no WSL, no Git Bash): only Node, Python and Ollama (service) installed via winget.',
    steps: [
      { title: '1. Requirements', body: ['Node.js 18+. Python and Ollama install themselves via winget (native).', 'Ollama runs as a Windows service and RANDI detects it.'] },
      { title: '2. Install the package', body: ['Install RANDI globally (or run it without installing via npx).', '`randi ensure` checks/installs Python and Ollama via winget if missing.'] },
      { title: '3. Onboarding & use', body: ['`randi setup` analyzes your GPU/VRAM and recommends models.', '`randi install <model>`, `randi chat` and `randi web` run directly in PowerShell.'] },
    ],
    after: ['No WSL and no Git Bash: runs 100% native (winget Python + Ollama service).'],
  },
];

export const content: Record<'es' | 'en', Landing> = {
  es: {
    nav: { models: 'Modelos', install: 'Instalación', github: 'GitHub', chat: 'Chatea', docs: 'Documentación', donar: 'Donar', marketplace: 'Marketplace', workspace: 'Workspace' },
    hero: {
      badge: 'Ρ RANDI Workspace · un ecosistema de trabajo impulsado por IA',
      title: ['Un ecosistema de trabajo', 'impulsado por agentes'],
      sub: 'RANDI detecta tu hardware y te recomienda los modelos que de verdad corren en tu dispositivo — texto, imagen y video — con instalación y configuración automáticas. En Windows se instala nativo (npm), sin WSL.',
      cta1: 'Instalar ahora',
      cta2: 'Ver la instalación',
      stats: '85 modelos · 5 plataformas · 100% privado',
    },
    quick: 'npm install -g randi-ai   ·   npx randi-ai setup',
    traza: { t: 'Todo queda trazado', d: 'Cada sesión registra contexto, actividad y tokens: resume, busca o reabre lo que ya hiciste.', items: ['Contexto en tiempo real y barra de RAM', 'Actividad y fases (server, descargas, sesiones)', 'Tokens por respuesta', 'Sesiones guardadas en tu dispositivo'] },

    arch: { t: 'Modelo + Harness', d: 'El modelo es el alma de la experiencia; RANDI es el harness que la organiza en tu equipo.', cards: [{ t: 'El modelo corre', d: 'LLMs y agentes locales ejecutan tus tareas: chat, codigo, razonamiento, vision.', tag: 'modelo' },{ t: 'RANDI organiza', d: 'Servidor, modelos, sesiones, contexto, tokens y voz gestionados por la herramienta.', tag: 'harness' },{ t: 'Todo queda trazado', d: 'Cada sesion registra y reanuda: contexto, actividad y tokens.', tag: 'trazabilidad' }] },
        modes: { t: 'Modos', d: 'Usa RANDI para cada tipo de trabajo con los modelos que corren en tu equipo.', items: [{ t: 'Chat', d: 'Conversacion fluida con streaming y markdown.', tag: 'llm' },{ t: 'Codigo', d: 'Asistente de programacion local para tu codigo.', tag: 'code' },{ t: 'Eco', d: 'Menos RAM para equipos limitados.', tag: 'eco' },{ t: 'Imagen', d: 'FLUX.2, Z-Image, Qwen-Image con ComfyUI.', tag: 'image' },{ t: 'Video', d: 'Wan 2.2, HunyuanVideo, LTX 2.3 (GPU dedicada).', tag: 'video' },{ t: 'Embed', d: 'Embeddings para RAG (nomic, mxbai).', tag: 'embed' }] },    stats: [
      { v: '85+', l: 'modelos curados' },
      { v: '5', l: 'plataformas' },
      { v: '7', l: 'cuantizaciones' },
      { v: '0', l: 'datos a la nube' },
    ],
    what: {
      title: 'Qué puedes hacer',
      sub: 'Un catálogo unificado: de LLMs ligeros a MoE de frontier, generación de imagen y video.',
      cards: [
        { t: 'Texto y código', d: 'Chat, razonamiento y coding con Qwen, DeepSeek, Llama, Gemma, Mistral y más.', tag: '60+ LLMs' },
        { t: 'Imágenes', d: 'FLUX.2, Z-Image, Qwen Image: generación local con ComfyUI en tu GPU.', tag: 'imagen' },
        { t: 'Video', d: 'Wan 2.2, HunyuanVideo, LTX 2.3: video local con GPU dedicada.', tag: 'video' },
        { t: 'WebGPU', d: 'Modelos <4B corriendo directo en la GPU del navegador, sin servidor.', tag: 'navegador' },
      ],
    },
    how: {
      title: 'Cómo funciona',
      sub: 'De cero a modelo corriendo en tres pasos.',
      steps: [
        { t: 'Analiza tu equipo', d: 'CPU, núcleos, RAM, GPU, VRAM y bandwidth — por CLI o en el navegador.' },
        { t: 'Recomienda y clasifica', d: 'Solo los modelos compatibles, organizados por tipo. Los que no corren te dicen qué hardware necesitas.' },
        { t: 'Instala y configura solo', d: 'Un clic: descarga, configura el modelo por defecto y queda listo para chatear.' },
      ],
    },
    install: {
      title: 'Instalación paso a paso',
      sub: 'Elige tu plataforma. Cada paso ha sido probado en el ecosistema correspondiente.',
      guides: guidesEs,
      note: 'En Windows se instala nativo con npm (sin WSL); en el resto, el instalador configura shell y Ollama. Requisitos: 4GB RAM (8GB+ recomendado), 3GB libres.',
    },
    ecosys: {
      t: 'Un ecosistema de trabajo impulsado por agentes',
      d: 'Módulos conectados que se van sumando al workspace: la consola de IA, documentos, agentes y más por venir.',
      items: [
        { t: 'IA · Consola', d: 'Chat de bloques con streaming, contexto por espacio.', soon: false },
        { t: 'Documentos', d: 'App de documentos con resumen con IA en tu espacio.', soon: false },
        { t: 'Agentes IA', d: 'Agentes especializados a medida, instalados en tu workspace.', soon: false },
        { t: 'Ingeniería', d: 'Herramientas técnicas (P&ID, HMI, instrumentación).', soon: true },
        { t: 'Energía Solar', d: 'Diseño, costos y cotizaciones fotovoltaicas.', soon: true },
        { t: 'CAD', d: 'Planos y diseño técnico asistido.', soon: true },
        { t: 'Educación', d: 'Tutores y cursos con IA.', soon: true },
        { t: 'Ciencia', d: 'Simulaciones y análisis de datos.', soon: true },
        { t: 'Arte', d: 'Imágenes, video y diseño.', soon: true },
      ],
    },
    features: {
      title: 'Funcionalidades',
      items: [
        'Multiplataforma: Android (Termux), Linux, macOS y Windows nativo (npm, sin WSL)',
        'Chat TUI con streaming, visión y voz',
        'Web local con Ollama + WebGPU (modelos en la GPU del navegador)',
        'Motor de compatibilidad estilo canirun.ai (grados S–F, 7 cuantizaciones)',
        'Instalación y configuración automática de modelos por hardware',
        'Sesiones, modo eco y modo programador',
        'Agentes de código',
      ],
    },
    faq: [
      { q: '¿Cuesta algo usar RANDI?', a: 'No. Es 100% local, gratuito y open source (MIT). Solo consumes los recursos de tu propio equipo.' },
      { q: '¿En qué plataformas funciona?', a: 'Android (Termux), Linux, macOS y Windows nativo. En Windows se instala con `npm install -g randi-ai` (o `npx randi-ai`) y funciona directo en PowerShell, sin WSL ni Git Bash — solo Python y Ollama nativos.' },
      { q: '¿Necesito internet?', a: 'Solo la primera vez para descargar modelos e instaladores. Después funciona sin conexión.' },
      { q: '¿Puedo correr modelos grandes?', a: 'Depende de tu hardware. El motor de compatibilidad te dice el grado (S–F) y, si no corre, el hardware mínimo necesario.' },
      { q: '¿Qué onda la privacidad?', a: 'Toda la inferencia ocurre en tu dispositivo. No se envía nada a ninguna nube.' },
      { q: '¿Genera imágenes y video?', a: 'Imágenes y video con modelos abiertos (FLUX.2, Wan 2.2…) vía ComfyUI; requiere GPU dedicada y se indica claramente.' },
    ],
    footer: 'RANDI © 2026 — IA local multiplataforma y open source. Licencia MIT.',
  },
  en: {
    nav: { models: 'Models', install: 'Installation', github: 'GitHub', chat: 'Chat', docs: 'Documentation', donar: 'Donate', marketplace: 'Marketplace', workspace: 'Workspace' },
    hero: {
      badge: 'Ρ RANDI Workspace · an AI-first, agent-driven ecosystem',
      title: ['An AI-first', 'agent-driven ecosystem'],
      sub: 'RANDI detects your hardware and recommends models that actually run on your machine — text, image and video — with automatic install and configuration. On Windows it installs natively (npm), no WSL.',
      cta1: 'Install now',
      cta2: 'See installation',
      stats: '85 models · 5 platforms · 100% private',
    },
    quick: 'npm install -g randi-ai   ·   npx randi-ai setup',
    traza: { t: 'Everything is traceable', d: 'Every session logs context, activity and tokens: resume, search or reopen what you already did.', items: ['Real-time context and RAM bar', 'Activity and phases (server, pulls, sessions)', 'Tokens per answer', 'Sessions saved on your device'] },

    arch: { t: 'Model + Harness', d: 'The model is the soul of the experience; RANDI is the harness that organizes it on your device.', cards: [{ t: 'The model runs', d: 'Local LLMs and agents handle your tasks: chat, code, reasoning, vision.', tag: 'model' },{ t: 'RANDI organizes', d: 'Server, models, sessions, context, tokens and voice handled by the tool.', tag: 'harness' },{ t: 'Everything is traceable', d: 'Every session logs and resumes: context, activity and tokens.', tag: 'traceability' }] },
        modes: { t: 'Modes', d: 'Use RANDI for each kind of work with models that run on your device.', items: [{ t: 'Chat', d: 'Fluid conversation with streaming and markdown.', tag: 'llm' },{ t: 'Code', d: 'Local coding assistant for your code.', tag: 'code' },{ t: 'Eco', d: 'Less RAM for constrained devices.', tag: 'eco' },{ t: 'Image', d: 'FLUX.2, Z-Image, Qwen-Image with ComfyUI.', tag: 'image' },{ t: 'Video', d: 'Wan 2.2, HunyuanVideo, LTX 2.3 (dedicated GPU).', tag: 'video' },{ t: 'Embed', d: 'Embeddings for RAG (nomic, mxbai).', tag: 'embed' }] },    stats: [
      { v: '85+', l: 'curated models' },
      { v: '5', l: 'platforms' },
      { v: '7', l: 'quantizations' },
      { v: '0', l: 'data to the cloud' },
    ],
    what: {
      title: 'What you can do',
      sub: 'A unified catalog: from lightweight LLMs to frontier MoE, image and video generation.',
      cards: [
        { t: 'Text & code', d: 'Chat, reasoning and coding with Qwen, DeepSeek, Llama, Gemma, Mistral and more.', tag: '60+ LLMs' },
        { t: 'Images', d: 'FLUX.2, Z-Image, Qwen Image: local generation with ComfyUI on your GPU.', tag: 'image' },
        { t: 'Video', d: 'Wan 2.2, HunyuanVideo, LTX 2.3: local video with a dedicated GPU.', tag: 'video' },
        { t: 'WebGPU', d: '<4B models running directly on your browser GPU, no server needed.', tag: 'browser' },
      ],
    },
    how: {
      title: 'How it works',
      sub: 'From zero to a running model in three steps.',
      steps: [
        { t: 'It analyzes your device', d: 'CPU, cores, RAM, GPU, VRAM and bandwidth — from the CLI or the browser.' },
        { t: 'It recommends & classifies', d: 'Only compatible models, organized by type. What can\u2019t run tells you the hardware you need.' },
        { t: 'It installs & configures', d: 'One click: download, set as default model, ready to chat.' },
      ],
    },
    install: {
      title: 'Step-by-step installation',
      sub: 'Pick your platform. Every step is tested on the corresponding ecosystem.',
      guides: guidesEn,
      note: 'On Windows it installs natively via npm (no WSL); elsewhere the installer configures shell and Ollama. Requirements: 4GB RAM (8GB+ recommended), 3GB free.',
    },
    ecosys: {
      t: 'An AI-first, agent-driven ecosystem',
      d: 'Connected modules added to the workspace over time: the AI console, documents, agents and more to come.',
      items: [
        { t: 'AI · Console', d: 'Block chat with streaming, context per space.', soon: false },
        { t: 'Documents', d: 'Docs app with AI summarization in your space.', soon: false },
        { t: 'AI Agents', d: 'Custom specialized agents installed into your workspace.', soon: false },
        { t: 'Engineering', d: 'Technical tools (P&ID, HMI, instrumentation).', soon: true },
        { t: 'Solar Energy', d: 'PV design, costs and solar quotes.', soon: true },
        { t: 'CAD', d: 'Plans and technical design.', soon: true },
        { t: 'Education', d: 'AI tutors and courses.', soon: true },
        { t: 'Science', d: 'Simulations and data analysis.', soon: true },
        { t: 'Art', d: 'Images, video and design.', soon: true },
      ],
    },features: {
      title: 'Features',
      items: [
        'Cross-platform: Android (Termux), Linux, macOS and native Windows (npm, no WSL)',
        'Chat TUI with streaming, vision and voice',
        'Local web with Ollama + WebGPU (models on the browser GPU)',
        'canirun-style compat engine (S–F grades, 7 quantizations)',
        'Automatic model install & configuration by hardware',
        'Sessions, eco mode and programmer mode',
        'Coding agents',
      ],
    },
    faq: [
      { q: 'Does RANDI cost anything?', a: 'No. It is 100% local, free and open source (MIT). You only use your own device\u2019s resources.' },
      { q: 'Which platforms does it run on?', a: 'Android (Termux), Linux, macOS and native Windows. On Windows install it with `npm install -g randi-ai` (or `npx randi-ai`) and it runs directly in PowerShell, no WSL or Git Bash \u2014 just native Python and Ollama.' },
      { q: 'Do I need internet?', a: 'Only the first time, to download models and installers. After that it works offline.' },
      { q: 'Can I run big models?', a: 'It depends on your hardware. The compat engine tells you the grade (S–F) and, if it can\u2019t run, the minimum hardware needed.' },
      { q: 'What about privacy?', a: 'All inference happens on your device. Nothing is sent to any cloud.' },
      { q: 'Can it generate images and video?', a: 'Images and video with open models (FLUX.2, Wan 2.2…) via ComfyUI; it needs a dedicated GPU and that is clearly indicated.' },
    ],
    footer: 'RANDI © 2026 — cross-platform local AI, open source. MIT license.',
  },
};

export const installSteps: Record<OSKey, string[]> = {
  android: ['pkg update && pkg upgrade -y', 'pkg install git -y', 'git clone https://github.com/sebastianl1/randi_IA.git', 'cd randi_IA', 'bash install-ollama.sh', 'randi setup'],
  linux: ['git clone https://github.com/sebastianl1/randi_IA.git', 'cd randi_IA', 'bash install-ollama.sh', 'randi setup'],
  macos: ['git clone https://github.com/sebastianl1/randi_IA.git', 'cd randi_IA', 'bash install-ollama.sh', 'randi setup'],
  'windows-wsl': ['sudo apt-get update && sudo apt-get install -y git', 'git clone https://github.com/sebastianl1/randi_IA.git', 'cd randi_IA', 'bash install-ollama.sh', 'randi setup'],
  'windows-gitbash': ['npm install -g randi-ai', 'randi ensure    # python + ollama natitú por winget', 'randi setup'],
};

export const osLabels: Record<OSKey, string> = {
  android: 'Android · Termux',
  linux: 'Linux',
  macos: 'macOS',
  'windows-wsl': 'Windows · WSL2',
  'windows-gitbash': 'Windows · Nativo (npm)',
};