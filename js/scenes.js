var scenes = [
{
    name: "get_up",
    background: "bedroom",
    // occurs: "mon-fri 7 00",
    anim: [
        "wake_up",
        {
            repeat_random: 5,
            anim: "lie_in_bed"
        },
        "get_up"
    ]
},
{
    name: "breakfast",
    background: "kitchen",
    // occurs when get_up ends
    anim: {
        parallel: [
        {
            choice: [
            {
                prob: 0.2,
                anim: [
                    "make_toast",
                    {
                        repeat_random: 10,
                        anim: "eat_toast"
                    }
                ]
            },
            {
                // default prob = 1-0.2 = 0.8
                anim: [
                    "make_cornflakes",
                    {
                        repeat_random: 5,

/*                        repeat_random: {
                            avg: 5,
                            sd: 1   // default
                        },
*/                        anim: "eat_cornflakes"
                    },
                    {
                        sometimes: 0.2,
                        anim: "open_mail"
                    },
                    {
                        repeat_random: 5,
                        anim: "eat_cornflakes"
                    }
                ]
            }
            ]
        },
        {
            repeat: true,
            anim: {
                delay_random: 5,
                anim: "train"
            }
        }
        ]
    }
},
{
    name: "wash",
    background: "bathroom",
    // occurs: {
    //     time: "mon-fri 7 30",
    //     spread: 5
    // },
    anim: {
        repeat_random: 5,
        anim: "washing"
    }
},
{
    name: "journey_to_work",
    background: "bus",
    // occurs: {
    //     time: "mon-fri 7 30",
    //     spread: 5
    // },
    anim: {
        repeat_random: 5,
        anim: "riding_bus"
    }
},
{
    name: "work",
    background: "office",
    // occurs: {
    //     time: "mon-fri 7 30",
    //     spread: 5
    // },
    anim: {
        repeat_random: 5,
        anim: "typing"
    }
},
{
    name: "journey_home",
    background: "bus",
    // occurs: {
    //     time: "mon-fri 7 30",
    //     spread: 5
    // },
    anim: {
        repeat_random: 5,
        anim: "riding_bus"
    }
},
{
    name: "dinner",
    background: "kitchen",
    // occurs: {
    //     time: "mon-fri 7 30",
    //     spread: 5
    // },
    anim: [
    "making_dinner",
    {
        repeat_random: 5,
        anim: "eating_dinner"
    }
    ]
},
{
    name: "tv",
    background: "living_room",
    // occurs: {
    //     time: "mon-fri 7 30",
    //     spread: 5
    // },
    anim: {
        repeat_random: 5,
        anim: "watching_tv"
    }
},
{
    name: "sleep",
    background: "bedroom",
    // occurs: {
    //     time: "mon-fri 7 30",
    //     spread: 5
    // },
    anim: {
        repeat_random: 5,
        anim: "sleeping"
    }
}
];

// repeated random events: lambda
// one-off random events: lambda, capped to one occurrence
// random choices: probability
// random transitions: time window

// lambda = avg. num. events per hour
// time to next event = -(ln rand) / lambda

// versioning: event A only occurs after may 2016, to preseve history
