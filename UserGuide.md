# Flow Counter User Guide

## Speedrun
1. Define an Intersection (Flows and Modes)
2. Share the Intersection name (and optional password) with observers
3. Observers create a counting session by selecting a sub-set of flows they will count
4. Download the data after observations have concluded

## Define an Intersection
Setting up the intersection is the key to all future counting. FlowCounter helps you define an intersection in steps:
1. Approaches (Entries and Exits)
2. Modes
3. Flows (or Movements - a link between two approaches)

It can be helpful to draw up a diagram to identify approaches and flows before trying to define them in FlowCounter.

### Intersection Information
Intersection Name and Description are displayed publicly in the intersections list so that observers can identify the correct intersection configuration to start a counting session against.

Observer password is optional. Set an observer password and then share that password with known/trusted observers to be sure that only known observers contribute data to your intersection. Without a password, anyone on the internet can open a counting session and record counts for the intersection.

### Approaches
An **Approach** represents a location that a person or vehicle either begins or ends their journey through the intersection.

There are four types of approaches: `Vehicle Entry`, `Vehicle Exit`, `Bike Lane`, and `Sidewalk`. The types are primarily to help conceptually and generally do not have restrictions.

The `Bike Lane` and `Sidewalk` approach types are not directional; this offers a solution for users who (for example) want to count pedestrian crossing volume regardless of direction.

The approach type does not have any impact on which **Modes** can be selected for a flow that starts or ends at that approach.

### Modes
Any travel mode names can be used, the defaults are simply a common set of modes. The order of modes here matches the order from left to right that observers will see on their counting screens.

### Flows
A **Flow** connects two **Approaches** for a given set of **Modes**. A Flow defines something an observer _could_ count. (When an observer starts a session, they select which Flow(s), and which mode(s) of the selected Flow(s), they will count in that session.)

There are no restrictions on Flow definition other than that a Flow cannot _start_ at a  `Vehicle Exit`, and cannot _end_ at a `Vehicle Entry`. Approach types may be mixed if needed. It is permissible for a Flow to, for example, start from a `Bike Lane` and end at a `Vehicle Exit`.

The Flow type  `Thru`, `Left`, `Right`, or `Crossing` is just for help with identifying the Flow, there is no logic associated with this parameter.

Give the Flow a meaningful name so that observers select and count the correct Flow.

When selecting modes for a Flow, select _all modes that should be available to count_ for this Flow. Even if you plan to have different observers counting different unique sets of modes for the same Flow, select all the modes here. Observers can select modes when setting up their session. Do not define a separate Flow unless that's a meaningful distinction.

## Count Vehicles
1. Select the Intersection where you're counting from the Intersections list.
2. Enter your Name or an identifier from your counting coordinator
3. If prompted for a password, enter the password from your counting coordinator.
4. Add any notes (optional)
5. Select which movements and modes you'll count.
6. On the next page, verify that you have a button for each and every movement-mode combination you expect to count.
7. Click on "Start Counting" in the top right. The system records the timestamp each time you click a button. Counts displayed reset every 15 minutes. If necessary, use "undo" in the top right to undo your last click.
8. When you're done, click "Stop Counting" in the top right, and confirm.
9. You can download data now, or the download is always available from the intersection menu. This download is _not_ limited to just the completed session, it will include data from all sessions at this intersection.

## Download Data
Data download always includes counts from _all_ sessions at a given intersection. It's a future task to allow for filtering download to a specific date range or a specific session.

