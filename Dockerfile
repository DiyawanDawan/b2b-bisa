FROM node:22-alpine

# Install curl for health check
RUN apk add --no-cache curl


# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies deterministically. Scripts are disabled because the
# postinstall Prisma generate step needs the schema copied below.
RUN npm ci --legacy-peer-deps --ignore-scripts --no-audit --no-fund

# Copy the rest of the application code
COPY . .

# Generate Prisma client. Prisma 7 validates DATABASE_URL while loading
# prisma.config.ts, so provide a harmless build-time placeholder for this command.
RUN DATABASE_URL=mysql://user:password@localhost:3306/bisa npx prisma generate

# Build TypeScript code
RUN npm run build

# Expose port
EXPOSE 3000

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001

# Create logs directory and set ownership
RUN mkdir -p /app/logs/error /app/logs/warn /app/logs/info /app/logs/http /app/logs/combined
RUN chown -R nextjs:nodejs /app/logs

# Change ownership of the app directory
RUN chown -R nextjs:nodejs /app
USER nextjs

# Health check - give more time for startup
HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=5 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start the application
CMD ["node", "dist/src/index.js"]
