FROM julia:1.10-bookworm
WORKDIR /app
COPY Project.toml .
RUN julia --project=. -e 'import Pkg; Pkg.instantiate()'
COPY . .
EXPOSE 8100
CMD ["julia", "--project=.", "src/Optimizer.jl"]
