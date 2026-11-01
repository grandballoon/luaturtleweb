-- Yin and yang
-- Half of a big circle, then half of a small one bulging out, then half of
-- another bulging in. The bulge out and the bulge in are the same size, so
-- the dark part is exactly half the circle: three half-turns, circle(r, 180).

local R = math.min(screen_width(), screen_height()) * 0.42

speed(7)
pensize(3)
color("black", "black")

-- The whole circle, from the bottom.
teleport(0, -R)
setheading(0)
circle(R)

-- The dark half: down the left of the big circle from the top, then up
-- through the middle by two small half circles, one turning each way.
teleport(0, R)
setheading(180)
begin_fill()
circle(R, 180)
circle(R / 2, 180)
circle(-R / 2, 180)
end_fill()

-- A dot of each color in the middle of each bulge.
teleport(0, R / 2)
dot(R / 3, "black")
teleport(0, -R / 2)
dot(R / 3, "white")
hideturtle()
