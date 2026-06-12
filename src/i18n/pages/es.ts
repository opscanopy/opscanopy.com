import type { PagesContent } from './en';

const UPDATED = '2026-06-12';

const es: Partial<PagesContent> = {
  ui: {
    updatedLabel: 'Última actualización',
  },

  privacy: {
    metaTitle: 'Política de privacidad',
    description:
      'Cómo gestiona OpsCanopy tus datos: cada herramienta se ejecuta por completo en tu navegador. Nada de lo que pegas se sube, se registra ni se comparte. Sin cuentas, sin rastreo.',
    eyebrow: 'Privacidad',
    heading: 'Tus datos nunca salen de tu dispositivo.',
    lead: 'OpsCanopy está diseñado con la privacidad por delante. Cada herramienta se ejecuta por completo en tu navegador: no hay servidor que reciba tu entrada, no hay cuenta que crear y no hay nada que subir. Esta política explica exactamente qué significa eso.',
    updated: UPDATED,
    sections: [
      {
        heading: 'La versión corta',
        body: [
          'El texto, los archivos y la configuración que pegas en cualquier herramienta de OpsCanopy se procesan localmente, dentro de tu propia pestaña del navegador. Nunca se nos envían a nosotros ni a terceros, y nunca se almacenan después de que cierras la pestaña.',
          'No gestionamos cuentas de usuario, no exigimos registro y no tenemos ninguna base de datos de tu actividad.',
        ],
      },
      {
        heading: 'Qué procesamos en tu navegador',
        body: [
          'Cada herramienta es un pequeño programa que se ejecuta como JavaScript del lado del cliente (o WebAssembly). Cuando pegas una línea de log, una regla de alerta, una lista CIDR o cualquier otra entrada, el cálculo ocurre en tu máquina. Los resultados que ves se producen localmente y desaparecen de la memoria cuando navegas a otra parte.',
          'Dado que el trabajo es local, las herramientas también siguen funcionando sin conexión una vez que se ha cargado la página.',
        ],
      },
      {
        heading: 'Qué no recopilamos',
        body: [
          'No recopilamos el contenido de tus entradas ni de tus salidas. No usamos cookies publicitarias, rastreadores entre sitios ni fingerprinting. No vendemos, alquilamos ni compartimos datos personales, porque, para empezar, no los recopilamos.',
          'Cualquier preferencia que el sitio recuerde —como tu tema claro/oscuro o tu idioma— se guarda en el almacenamiento local de tu navegador, en tu dispositivo, y nunca se nos transmite.',
        ],
      },
      {
        heading: 'Alojamiento y registros del servidor',
        body: [
          'OpsCanopy se sirve como archivos estáticos desde un proveedor de alojamiento y una red de distribución de contenidos. Como prácticamente todos los proveedores de alojamiento web, estos pueden conservar registros de solicitudes estándar y de corta duración (por ejemplo, una dirección IP y el user-agent del navegador) para entregar las páginas, mitigar el abuso y mantener el servicio seguro. Estos registros son operativos y no se usan para perfilarte.',
        ],
      },
      {
        heading: 'Servicios de terceros',
        body: [
          'Mantenemos las dependencias externas al mínimo. El sitio puede cargar recursos como fuentes web necesarias para renderizar las páginas. No incorporamos redes publicitarias ni píxeles de rastreo de redes sociales.',
        ],
      },
      {
        heading: 'Cambios en esta política',
        body: [
          'Si esta política cambia, actualizaremos la fecha que se muestra en la parte superior de esta página. El uso continuado de las herramientas después de una actualización significa que aceptas la política revisada.',
        ],
      },
      {
        heading: 'Preguntas',
        body: [
          'Las preguntas sobre privacidad son bienvenidas. La mejor manera de contactarnos es a través de nuestra organización pública de GitHub; consulta la página de Contacto para ver el enlace.',
        ],
      },
    ],
  },

  about: {
    metaTitle: 'Acerca de OpsCanopy',
    description:
      'OpsCanopy es un dosel creciente de herramientas gratuitas, privadas y basadas en el navegador para ingenieros de plataforma y DevOps: validadores, conversores, testers y linters que nunca tocan un servidor.',
    eyebrow: 'Acerca de',
    heading: 'Herramientas DevOps gratuitas que se ejecutan por completo en tu navegador.',
    lead: 'OpsCanopy es una colección creciente de utilidades específicas para ingenieros de plataforma y DevOps. Cada una resuelve un problema pequeño y real, y cada una se ejecuta 100 % del lado del cliente, así que lo que pegas nunca sale de tu dispositivo.',
    updated: UPDATED,
    sections: [
      {
        heading: 'Por qué existe',
        body: [
          'Los ingenieros recurren a herramientas rápidas decenas de veces al día: validar un archivo de workflow, decodificar un token, probar una regex contra líneas de log, calcular una subred, convertir un archivo de supresión. Demasiadas de esas herramientas te piden pegar datos internos sensibles en un sitio web que silenciosamente los sube a un servidor.',
          'OpsCanopy adopta el enfoque opuesto. Las herramientas son rápidas, gratuitas y privadas por diseño: nada de lo que pegas se transmite jamás, porque no hay ningún lugar al que pueda ir.',
        ],
      },
      {
        heading: 'Cómo funciona',
        body: [
          'Todo el sitio es estático. Cada herramienta es un programa autónomo que se ejecuta en tu navegador usando JavaScript y, cuando resulta útil, WebAssembly. No hay backend, no hay API y no hay sistema de cuentas. Una vez que una página se ha cargado, la mayoría de las herramientas siguen funcionando incluso con la red desconectada.',
        ],
      },
      {
        heading: 'Gratuito y abierto',
        body: [
          'OpsCanopy es de uso gratuito, sin registro y sin muro de pago. Las herramientas se desarrollan contra especificaciones reales y vectores de prueba para que su salida sea fiable, y el catálogo sigue creciendo a medida que se publican nuevas utilidades.',
        ],
      },
      {
        heading: 'Para quién es',
        body: [
          'Está hecho para ingenieros de plataforma, SRE, profesionales de DevOps y cualquiera que viva cerca de la infraestructura, pero las herramientas son útiles para cualquier desarrollador que quiera una respuesta rápida y privada sin instalar nada.',
        ],
      },
    ],
  },

  terms: {
    metaTitle: 'Términos y condiciones',
    description:
      'Los términos en lenguaje claro para usar OpsCanopy: herramientas DevOps gratuitas y basadas en el navegador, ofrecidas tal cual, sin garantía y sin responsabilidad por cómo uses la salida.',
    eyebrow: 'Términos',
    heading: 'Términos y condiciones.',
    lead: 'Estos términos rigen tu uso de OpsCanopy y sus herramientas. Están escritos en lenguaje claro y son intencionadamente breves. Al usar el sitio, los aceptas.',
    updated: UPDATED,
    sections: [
      {
        heading: 'Aceptación de estos términos',
        body: [
          'Al acceder a OpsCanopy o usarlo, aceptas quedar vinculado por estos términos. Si no estás de acuerdo, no uses el sitio.',
        ],
      },
      {
        heading: 'Uso de las herramientas',
        body: [
          'OpsCanopy ofrece utilidades gratuitas para tu propio uso lícito. Puedes usar las herramientas para trabajo personal y comercial. Aceptas no hacer un uso indebido del sitio, por ejemplo intentando interrumpirlo, sobrecargarlo o usarlo para infringir la ley.',
          'Dado que cada herramienta se ejecuta en tu navegador, eres responsable de la entrada que proporcionas y de revisar la salida antes de confiar en ella.',
        ],
      },
      {
        heading: 'Sin garantía',
        body: [
          'Las herramientas se proporcionan «tal cual» y «según disponibilidad», sin garantías de ningún tipo, ya sean expresas o implícitas. No garantizamos que las herramientas vayan a ser precisas, libres de errores, ininterrumpidas o aptas para un propósito particular. Verifica siempre los cambios críticos —incluida la salida de redes, seguridad, programación de tareas y configuración— contra tus propias fuentes autorizadas antes de aplicarlos.',
        ],
      },
      {
        heading: 'Limitación de responsabilidad',
        body: [
          'En la máxima medida permitida por la ley, OpsCanopy y sus colaboradores no se hacen responsables de ningún daño directo, indirecto, incidental o consecuente derivado de tu uso, o de la imposibilidad de uso, del sitio o sus herramientas, incluida cualquier decisión tomada con base en su salida.',
        ],
      },
      {
        heading: 'Marcas comerciales',
        body: [
          'Los nombres de productos y empresas a los que hacen referencia las herramientas —incluidos Grafana, Loki, Prometheus, Kubernetes, GitHub Actions y otros— son marcas comerciales de sus respectivos propietarios. OpsCanopy no está afiliado a ellos ni cuenta con su respaldo. Loki y Grafana son marcas comerciales de Raintank, Inc.',
        ],
      },
      {
        heading: 'Cambios en estos términos',
        body: [
          'Podemos actualizar estos términos de vez en cuando. Cuando lo hagamos, revisaremos la fecha en la parte superior de esta página. El uso continuado del sitio después de un cambio significa que aceptas los términos actualizados.',
        ],
      },
      {
        heading: 'Contacto',
        body: [
          'Si tienes preguntas sobre estos términos, contáctanos a través de los canales indicados en la página de Contacto.',
        ],
      },
    ],
  },

  contact: {
    metaTitle: 'Contacto',
    description:
      'Ponte en contacto con OpsCanopy. Reporta un error, solicita una herramienta o haz una pregunta a través de nuestra organización pública de GitHub.',
    eyebrow: 'Contacto',
    heading: 'Ponte en contacto.',
    lead: 'OpsCanopy se construye y se mantiene de forma abierta. La forma más rápida de reportar un error, solicitar una función o hacer una pregunta es a través de nuestra organización pública de GitHub.',
    sections: [
      {
        heading: 'Errores y solicitudes de funciones',
        body: [
          '¿Encontraste algo que no funciona o tienes una idea para una herramienta que te gustaría que existiera? Abre un issue en GitHub. Los reportes claros y reproducibles —qué pegaste, qué esperabas y qué ocurrió— nos ayudan a arreglar las cosas rápido.',
        ],
      },
      {
        heading: 'Preguntas generales',
        body: [
          'Para cualquier otra cosa —incluidas preguntas sobre privacidad o comentarios generales— GitHub es el mejor lugar para contactarnos. Lo leemos todo, aunque la respuesta tarde un poco.',
        ],
      },
    ],
    links: [
      { label: 'OpsCanopy en GitHub', href: 'https://github.com/opscanopy', external: true },
      { label: '@opscanopy en X', href: 'https://twitter.com/opscanopy', external: true },
    ],
  },
};

export default es;
