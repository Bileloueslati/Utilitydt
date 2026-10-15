API de thème — Stellar Design System

Objectif

Mettre à disposition une API TypeScript centralisée pour accéder aux tokens du design system, avec une prise en charge des thèmes clair et sombre ainsi que des références aux variables CSS actives.

Fonctionnement

Le fichier theme.generated.ts est généré automatiquement à partir de light.css et dark.css. Les fichiers CSS restent la source de vérité.

L’API expose trois entrées :

* theme.light : valeurs directes des tokens du thème clair.
* theme.dark : valeurs directes des tokens du thème sombre.
* theme.current : références aux variables CSS via var(--...), résolues par le navigateur selon le thème appliqué.

Les tokens sont organisés dans une structure hiérarchique (color, spacing, shape, elevation, etc.) pour faciliter leur utilisation dans les applications.

Exemple d’utilisation

import { theme } from '@stellar/react';
// Direct values
const lightText = theme.light.color.text.default;
const darkText = theme.dark.color.text.default;
// CSS variable reference
const currentText = theme.current.color.text.default;

Utilisation dans un style :

<div style={{ color: theme.current.color.text.default }}>
  Texte adapté au thème actif
</div>

Génération

Après toute modification des fichiers CSS, régénérer le module avec :

node js-scripts/generate-theme.cjs --write

Le fichier généré ne doit pas être modifié manuellement.

Bénéfices

* Une API cohérente et typée pour les applications React et les composants du design system.
* Une distinction claire entre les valeurs explicites des thèmes et les références CSS dynamiques.
* Une meilleure centralisation des tokens et moins de valeurs codées en dur.
* Une maintenance simplifiée grâce à la génération automatique depuis les fichiers CSS.
