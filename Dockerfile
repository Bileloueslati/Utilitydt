# Image de base
FROM node:20-alpine

# Dossier de travail
WORKDIR /app

# Copier les fichiers package
COPY package*.json ./

# Installer dépendances
RUN npm install

# Copier le reste
COPY . .

# Build TypeScript
RUN npm run build

# Port exposé
EXPOSE 3000

# Commande de lancement
CMD ["node", "dist/index.js"]
