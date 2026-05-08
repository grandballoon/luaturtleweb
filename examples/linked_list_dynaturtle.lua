-- linked_list_dynaturtle.lua
--
-- A DynaTurtle in the spirit of Papert's Mindstorms.  Where the canonical
-- DynaTurtle embeds Newton's laws (forward = apply velocity, keeping a hidden
-- velocity state), this turtle embeds the laws of a singly-linked list.
--
-- The turtle "lives" at a cursor node.  Its movement primitives follow the
-- structure of the list rather than Euclidean space:
--
--   list:step()           -- follow the next-pointer       (cf. forward)
--   list:rewind()         -- return to head                (cf. home)
--   list:push(v)          -- append a node                 (cf. apply force)
--   list:insert_after(v)  -- splice a new node after cursor
--   list:delete()         -- remove cursor node, advance cursor
--   list:peek()           -- read the value at cursor
--
-- The turtle draws the list as it operates on it, highlighting the cursor
-- node so you can watch the "turtle" move through the structure.

local function LinkedListTurtle()
    local head, cursor, n = nil, nil, 0

    local DOT_R = 16    -- node dot radius (pixels)
    local GAP   = 80    -- center-to-center horizontal spacing
    local ROW_Y = 20    -- y coordinate of the node row

    local t = Turtle()
    t:hideturtle()
    t:speed(0)

    -- Recompute _x/_y on every node so the list stays centered on screen.
    local function layout()
        local node, i = head, 0
        while node do
            node._x = (i - (n - 1) / 2) * GAP
            node._y = ROW_Y
            node = node.next
            i = i + 1
        end
    end

    -- Draw an arrow from (ax, ay) toward (bx, by), stopping DOT_R before it.
    local function arrow_to(ax, ay, bx, by)
        t:penup()
        t:teleport(ax, ay)
        t:setheading(t:towards(bx, by))
        t:pencolor(0.45, 0.75, 1.0)
        t:pensize(1.5)
        t:pendown()
        t:forward(t:distance(bx, by) - DOT_R - 2)
        local hx, hy = t:xcor(), t:ycor()
        t:right(150); t:forward(8)
        t:penup(); t:teleport(hx, hy)
        t:pendown(); t:left(150); t:left(150); t:forward(8)
    end

    local function redraw()
        t:clear()
        if not head then return end
        layout()

        -- Arrows between nodes.
        local node = head
        while node do
            if node.next then
                arrow_to(node._x, node._y, node.next._x, node.next._y)
            else
                -- Null terminator marker.
                t:penup()
                t:teleport(node._x + DOT_R + 6, node._y - 6)
                t:pencolor(0.7, 0.3, 0.3)
                t:pendown()
                t:write("nil")
            end
            node = node.next
        end

        -- Dots and labels on top of the arrows.
        node = head
        while node do
            local cur = (node == cursor)
            t:penup()
            t:teleport(node._x, node._y)
            if cur then
                t:dot(DOT_R * 2, 0.95, 0.75, 0.10)
            else
                t:dot(DOT_R * 2, 0.20, 0.45, 0.65)
            end

            -- Value label centered on the dot.
            t:penup()
            t:teleport(node._x, node._y - 6)
            t:pencolor(0.05, 0.05, 0.05)
            t:pendown()
            t:write(tostring(node.value), false, "center")

            -- Cursor indicator below the active node.
            if cur then
                t:penup()
                t:teleport(node._x, node._y - DOT_R - 14)
                t:pencolor(0.95, 0.80, 0.15)
                t:pendown()
                t:write("^ here", false, "center")
            end

            node = node.next
        end
    end

    -- ── Public DynaTurtle interface ──────────────────────────────────────────

    local llt = {}

    -- Append a new node at the tail and redraw.
    function llt:push(v)
        local node = {value = v, next = nil}
        n = n + 1
        if not head then
            head, cursor = node, node
        else
            local tail = head
            while tail.next do tail = tail.next end
            tail.next = node
        end
        redraw()
        return llt
    end

    -- Follow the next-pointer: move the cursor one step forward.
    function llt:step()
        if cursor and cursor.next then
            cursor = cursor.next
            redraw()
        end
        return llt
    end

    -- Return the cursor to the head of the list.
    function llt:rewind()
        cursor = head
        redraw()
        return llt
    end

    -- Splice a new node immediately after the cursor.
    function llt:insert_after(v)
        if not cursor then return llt:push(v) end
        local node = {value = v, next = cursor.next}
        cursor.next = node
        n = n + 1
        redraw()
        return llt
    end

    -- Remove the cursor node.  Cursor advances to the next node, or if
    -- there is none, retreats to the new tail.
    function llt:delete()
        if not cursor then return llt end
        n = n - 1
        if cursor == head then
            head   = head.next
            cursor = head
        else
            local prev = head
            while prev.next ~= cursor do prev = prev.next end
            prev.next = cursor.next
            cursor    = cursor.next or prev
        end
        redraw()
        return llt
    end

    -- Return the value stored at the cursor node (does not redraw).
    function llt:peek()
        return cursor and cursor.value
    end

    return llt
end

-- ── Demo ─────────────────────────────────────────────────────────────────────

speed(0)
bgcolor(0.05, 0.06, 0.09)
hideturtle()

local list = LinkedListTurtle()

-- Build the list one node at a time; watch each node appear.
for _, v in ipairs({12, 37, 5, 91, 28}) do
    list:push(v)
end

-- Walk the cursor three steps forward (12 → 37 → 5 → 91).
list:step():step():step()

-- Insert a new node after the cursor, then step onto it.
print("inserting 64 after " .. tostring(list:peek()))
list:insert_after(64):step()   -- cursor now at 64

-- Delete the cursor node; cursor advances to 28.
print("deleting " .. tostring(list:peek()))
list:delete()                  -- list: 12 → 37 → 5 → 91 → 28

-- Return to the head.
list:rewind()
