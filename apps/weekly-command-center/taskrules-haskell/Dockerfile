FROM haskell:9.4-slim
WORKDIR /app
COPY taskrules.cabal .
RUN cabal update && cabal build --only-dependencies
COPY . .
RUN cabal build
EXPOSE 8200
CMD ["cabal", "run", "taskrules"]
