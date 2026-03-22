# Production Incident Game

Debug real production failures.

No algorithms.  
No whiteboard interviews.  
Just incidents.

------------------------------------------------------------------------

## What is this?

A small terminal-based game where you debug realistic production issues.

You are dropped into situations like:

-   HTTP 500 errors in production
-   broken deployments
-   database connection issues
-   retry storms
-   data corruption

You choose what to do next and see how the system reacts.

------------------------------------------------------------------------

## How it works

Each scenario is a decision tree.

You start from an incident:

    Production website returning HTTP 500 errors

Then choose your next step:

    1. Check logs
    2. Restart service
    3. Rollback deployment
    4. Check database

Some actions help.  
Some waste time.  
Some make things worse.

Your score depends on how efficiently you resolve the incident.

------------------------------------------------------------------------

## Why

Most interview prep focuses on:

-   algorithms
-   puzzles
-   theory

But real work is:

-   reading logs
-   forming hypotheses
-   debugging under uncertainty

This is an attempt to simulate that.

------------------------------------------------------------------------

## Run locally

``` bash
# copy environment config
cp .env.example .env

# build and run
docker build -t p0.run .
docker run --env-file .env -p 8000:8000 p0.run
```

Then open:

    http://localhost:8000/

------------------------------------------------------------------------

## Tech

-   Python + FastAPI
-   PostgreSQL
-   Vanilla JS + xterm.js
-   Docker

------------------------------------------------------------------------

## Notes

-   This is intentionally simple
-   Scenarios are simplified but inspired by real incidents
-   The full scenario set is not included in this repo

------------------------------------------------------------------------

## Feedback

I'd love your feedback and... **find the Easter Eggs!**
