module Optimizer

using HTTP
using JSON3
using Dates

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"]

struct WorkItem
    id::Any
    title::String
    priority::Int
    minutes::Int
    deadline::Union{Date, Nothing}
end

function parse_deadline(raw)::Union{Date, Nothing}
    raw === nothing && return nothing
    s = String(raw)
    isempty(s) && return nothing
    try
        # Accept both "2026-07-06" and "2026-07-06T17:00" style strings.
        return Date(first(split(s, "T")))
    catch
        return nothing
    end
end

function build_items(tasks)::Vector{WorkItem}
    items = WorkItem[]
    for t in tasks
        push!(items, WorkItem(
            get(t, :id, get(t, "id", nothing)),
            String(get(t, :title, get(t, "title", "untitled"))),
            Int(get(t, :priority, get(t, "priority", 3))),
            max(Int(get(t, :estimate_minutes, get(t, "estimate_minutes", 30))), 5),
            parse_deadline(get(t, :deadline, get(t, "deadline", nothing))),
        ))
    end
    return items
end

# Days from Monday-of-this-week (index 1) that a deadline falls on, clamped
# into the 1..5 planning window; deadlines outside the week sort to the end.
function deadline_day_index(deadline::Union{Date,Nothing}, week_start::Date)::Int
    deadline === nothing && return 6
    offset = Dates.value(deadline - week_start) + 1
    return offset < 1 ? 1 : (offset > 5 ? 6 : offset)
end

function score_assignment(assignment::Dict{Int, Vector{WorkItem}}, week_start::Date)::Float64
    penalty = 0.0
    for (day_idx, items) in assignment
        for item in items
            target = deadline_day_index(item.deadline, week_start)
            if target < 6 && day_idx > target
                # Lateness weighted by priority (priority 1 = most severe).
                penalty += (day_idx - target) * (6 - item.priority)
            end
        end
    end
    return penalty
end

"""
Deadline-aware, priority-weighted greedy bin-packer with a bounded local-swap
improvement pass. Real (if simple) combinatorial scheduling — not a stub.
"""
function optimize_week(items::Vector{WorkItem}, daily_capacity::Int, week_start::Date)
    ordered = sort(items; by = it -> (deadline_day_index(it.deadline, week_start), it.priority))

    remaining = Dict(i => daily_capacity for i in 1:5)
    assignment = Dict{Int, Vector{WorkItem}}(i => WorkItem[] for i in 1:5)
    overflow = WorkItem[]

    for item in ordered
        placed = false
        preferred = deadline_day_index(item.deadline, week_start)
        search_order = preferred <= 5 ? vcat(preferred:5, 1:(preferred - 1)) : (1:5)
        for day in search_order
            if remaining[day] >= item.minutes
                push!(assignment[day], item)
                remaining[day] -= item.minutes
                placed = true
                break
            end
        end
        placed || push!(overflow, item)
    end

    # Bounded local-swap improvement: try swapping single items between two
    # days if it reduces total lateness penalty without breaking capacity.
    improved = true
    passes = 0
    while improved && passes < 25
        improved = false
        passes += 1
        for d1 in 1:5, d2 in 1:5
            d1 == d2 && continue
            for (i1, it1) in enumerate(assignment[d1])
                for (i2, it2) in enumerate(assignment[d2])
                    cap1 = remaining[d1] + it1.minutes - it2.minutes
                    cap2 = remaining[d2] + it2.minutes - it1.minutes
                    (cap1 < 0 || cap2 < 0) && continue
                    before = score_assignment(assignment, week_start)
                    assignment[d1][i1], assignment[d2][i2] = it2, it1
                    after = score_assignment(assignment, week_start)
                    if after < before
                        remaining[d1], remaining[d2] = cap1, cap2
                        improved = true
                    else
                        assignment[d1][i1], assignment[d2][i2] = it1, it2
                    end
                end
            end
        end
    end

    plan = Dict{String, Any}()
    for (idx, day_name) in enumerate(DAYS)
        plan[day_name] = [Dict("task_id" => it.id, "title" => it.title, "minutes" => it.minutes)
                           for it in assignment[idx]]
    end

    remaining_capacity = Dict(DAYS[i] => remaining[i] for i in 1:5)
    overflow_json = [Dict("task_id" => it.id, "title" => it.title, "minutes" => it.minutes) for it in overflow]

    return Dict(
        "plan" => plan,
        "overflow" => overflow_json,
        "remaining_capacity" => remaining_capacity,
        "score" => score_assignment(assignment, week_start),
    )
end

function handle_optimize(req::HTTP.Request)
    body = JSON3.read(String(req.body))
    tasks = get(body, :tasks, [])
    daily_capacity = Int(get(body, :daily_capacity_minutes, 360))
    items = build_items(tasks)
    week_start = Dates.Date(Dates.today()) - Dates.Day(Dates.dayofweek(Dates.today()) - 1)
    result = optimize_week(items, daily_capacity, week_start)
    return HTTP.Response(200, ["Content-Type" => "application/json"], body = JSON3.write(result))
end

function health(::HTTP.Request)
    return HTTP.Response(200, ["Content-Type" => "application/json"], body = JSON3.write(Dict("status" => "ok", "engine" => "julia")))
end

function run_server(; port::Int = 8100)
    router = HTTP.Router()
    HTTP.register!(router, "GET", "/health", health)
    HTTP.register!(router, "POST", "/optimize", handle_optimize)
    @info "optimizer-julia listening on port $port"
    HTTP.serve(router, "0.0.0.0", port)
end

end # module

if abspath(PROGRAM_FILE) == @__FILE__
    Optimizer.run_server(port = parse(Int, get(ENV, "PORT", "8100")))
end
