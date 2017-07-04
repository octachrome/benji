Benji
=====

Benji is a language for writing deterministically "random" animations.

- A script is a list of statements, each of which is writen on its own line.
- By default, statements are executed by the player in order, waiting for one to finish before starting the next.
- Space at the start of a line is important, so don't go indenting lines willy-nilly.
- A comment begins with a `#`, and can appear after a statement or on its own line.


Playing animations
------------------

Before you play an animation, you should set a background to show it against. Here's how to do both:

    :background 0
        :play Office-BackgroundLoop
    :play Office-Trans-EnterLeft

Both `Office-BackgroundLoop.json` and `Office-Trans-EnterLeft.json` should exist in a folder named `anim` somewhere
near the script.

You can create as many background channels as you like, and they will all play simultaneously:

    :background 0
        :play StaticBackgroundImage
    :background 1
        :play BackgroundLoop
    :background 2
        :call complicated_sequence
    :play ForegroundAnimation

The background animations will loop until you tell them to stop:

    :background 1
        :nothing


Dialog
------

To show dialog, use the `>` and `<` statements. These will show dialog on the left and right side of the screen,
respectively. The dialog will be visible for the duration of the next statement, so you should play some kind of
talking or listening animation directly afterwards to make sure that the dialog appears for a reasonable amount
of time:

    > I'll have it done by Monday, sir.
    :play Office-Desk-Talking
    < You'll have it done today!
    :play Office-Desk-Listening

This could get annoying if there is a lot of dialog, so you can set the default dialog animations using the
`:set dialog_anims` command. The first parameter is the animation for `>` dialog, and the second for `<`:

    :set dialog_anims Office-Desk-Talking Office-Desk-Listening
    > I'll have it done by Monday, sir.
    < You'll have it done today!
    > But sir...!
    < No buts, butthead!
    :play Office-Trans-ExitLeft

In this mode, the dialog will be visible until the current dialog animation has finished playing. When the next
statement starts (in this case, the exit left animation), the dialog will be hidden.

You can clear `dialog_anims` to return to normal mode like this:

    :set dialog_anims
    > Hi
    :play Office-Desk-Talking


Choices
-------

The `|` symbol shows that a statement is an alternative to the one above it. To make the player choose randomly from
a list of statements, prefix all but the first one with a `|`. A statement without a `|` switches back to sequential
play:

    :play Office-Trans-EnterLeft
    :play Office-Centre-PressUps
    |:play Office-Centre-SitUps
    |:play Office-Centre-Burpees
    :play Office-TransExitLeft

Here, the first and last statements are always executed, but only one of the middle three will be selected at random.
All the alternatives in a choices are equally likely (To create choices with uneven probabilities, use the `:maybe`
statement.)


Groups of statements
--------------------

Indenting one or more statements groups them together with the statement above. It is useful to indent when you want
the statement above to operate on a group when it would normally only operate on a single statement.

For example, you can define a choice between several blocks of statements by indenting all but the first one in each
block:

    :play Sequence-1-A
        :play Sequence-1-B
        :play Sequence-1-C
    |:play Sequence-2-A
        :play Sequence-2-B
        :play Sequence-2-C
    |:play Sequence-3-A
        :play Sequence-3-B
        :play Sequence-3-C

Here, the choice is between sequence 1, sequence 2, or sequence 3, where all of the sequences consist of three
animations.

Also, remember that dialog remains visible for the duration of the next statement. If the next statement is a group,
the dialog will remain visible until the whole group finishes executing:

    > Aaaaaaaaaaaaaaaaaaaaaargh!
    :play Falling
        :play Falling-Past-Balcony
        :play Falling
        :play Falling-Past-Washing
        # Dialog is still visible here
        :play Falling
    # Dialog no longer visible
    :play Splat

When grouping statements, it doesn't matter how much they are indented, so long as it is deeper than the statement
above. Try not to mix tabs and spaces, you'll just get confused.

You can also indent any time, just to make your script more readable:

    # Greeting
    > Hi.
        < Hi.
        > How are you?
        < Fine thanks.
    # Main conversation
    > I need a favour.
        < What can I do for you?
        > I have this pen stuck in my ear.
        < How did you manage that?
        > Just pull it out, ok?
    # Sign-off
    > Thanks, bye.
        < Bye.
        < (Idiot.)


Random decisions
----------------

To execute a statement 30% of the time:

    :maybe 30%
        :play Drop-Teaspoon

The statement to maybe execute must be indented. As you might expect, you can execute a group of statements 5% of the time
by indenting them all:

    :maybe 5%
        > We don't have this conversation very often.
        < Yeah, why is that I wonder?
        > Because it's boring.
        < Right. I guess the author of this document is running out of ideas.

If the `:maybe` script doesn't execute, you can specify an alternative to execute instead using the `:else` statement:

    < Fax this to Mr. Pondicherry.
    :maybe 1%
        > Fax my balls!
    :else
        > Ok, boss.


Repeating things
----------------

The `:repeat` statement can be used to repeat a group of statements. It can be used in three ways:

- To repeat a statement a number of times, use `:repeat 5 times`.
- To repeat a statement for a given amount of time, use `:repeat for 10 secs`.
- To repeat a statement until a given time of day, use `:repeat until 14:30`.

The statements to be repeated should be indented below:

    :repeat 4 times
        :play Telephone-Ring
    :play Telephone-PickUp
    > Hello?


Waiting
-------

You can wait by repeating nothing. There's a special command `:nothing` for this:

    # Wait for 5 seconds
    :repeat for 5 seconds
        :nothing
    # Now do something


Variables and conditions
------------------------

You can set variables and then use them to make decisions:

    :set x 0
    :while x < 10
        :if x % 2 == 0
            < {{x}} is an odd number!
            :play EvenNumberAnimation
        :else
            < {{x}} is an even number!
            :play OddNumberAnimation
        :set x x + 1

Variables can be of any standard JavaScript type: array, object, number, etc. To set a variable:

    :set <variable_name> <expression>

The expression is a JavaScript expression and can use any standard JavaScript library functions and refer to other variables. There are also some useful built-in functions:

- `pick(<array>)` - randomly chooses a value from the given array and returns it
- `maybe(<probability>)` - returns true with the given probability, or false (probability should be between 0 and 1)
- `rand()` - returns a random number between 0 and 1
- `randint(min, max)` - returns a random integer between min and max (inclusive)
- `randomGenerator(seed)` - returns an object with all the above functions, but the random sequence is seeded with the given value
- `now()` - returns the current animation time as a JavaScript `Date` object

These functions are repeatably random - they will behave exactly the same way for a given script at a given date and time. Use them instead of JavaScript's `Math.random()`.

The `:if` and `:while` statements accept any valid JavaScript expression. The `:else` statement is optional after an `:if`.

Variables can be interpolated into dialog using the `{{variable}}` syntax.


Subroutines
-----------

Group reusable fragments of script into a subroutine, then call it from several places:

    :sub make_tea
        :play fill_kettle
        :play pour_water
        :play add_milk

    :call make_tea

    # Later on, make some more tea
    :call make_tea


Include files
-------------

If a script file is getting too large, you can split it across several files and then include them from the main script:

    :include useful_stuff.benji


Examples
--------

Most of the time, order one of the usual (all equally likely), but occasonally order something special:

    :maybe 99%
        > I'll have a cheese burger.
        |> Chicken nuggets.
        |> I'd like ham and eggs.
        |> Lasagne please.
    :else
        > Tonight I'm celebrating. Lobster and Champagne!


Several possible conversation branches, showing many levels of indentation and how choices can be continued after
outdenting:

    > How are you doing?
    |> How are things?
    |> How are you feeling?
    < Oh, okay dear. Can't complain!
    |< Well, the goblins have been causing trouble in the garden again!
        > Oh no! I should bring Torpedo along to scare them off.
            < Good idea sweetheart!
            |< Yes!
            |< Are goblins scared of cats?
                > I have no idea.
        |> Oh! Those tykes!
        |> You should try to catch one! It may have useful information.
    |< Ooh, I'm feeling a bit confused today
    |< A little bit sleepy, my dear.
        > Ok, I won't keep you up too long then!
