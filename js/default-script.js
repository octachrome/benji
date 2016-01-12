var defaultScript = [
{
    name: "get_up",
    backdrop: "bedroom",
    // occurs: "mon-fri 7 00",
    anim: [
        "wake_up",
        {
            repeat_random: 2,
            anim: "lie_in_bed"
        },
        "get_up"
    ]
},
{
    name: "breakfast",
    backdrop: "kitchen",
    // occurs when get_up ends
    anim: {
        choice: [
        {
            weight: 0.4,
            anim: [
                "make_toast",
                {
                    repeat_random: 2,
                    anim: "eat_toast"
                }
            ]
        },
        {
            // default weight = 1-0.4 = 0.6
            anim: [
                "make_cornflakes",
                {
                    repeat_random: 1,

/*                        repeat_random: {
                        avg: 5,
                        sd: 1   // default
                    },
*/                        anim: "eat_cornflakes"
                },
                {
                    likelihood: 0.4,
                    anim: "open_mail"
                },
                {
                    repeat_random: 1,
                    anim: "eat_cornflakes"
                }
            ]
        }
        ]
    }
    /* todo: background
    {
        repeat: true,
        anim: {
            delay_random: 5,
            anim: "train"
        }
    }
    */
},
{
    name: "wash",
    backdrop: "bathroom",
    // occurs: {
    //     time: "mon-fri 7 30",
    //     spread: 5
    // },
    anim: {
        repeat_random: 2,
        anim: "washing"
    }
},
{
    name: "journey_to_work",
    backdrop: "bus",
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
    backdrop: "office",
    // occurs: {
    //     time: "mon-fri 7 30",
    //     spread: 5
    // },
    anim: {
        repeat_random: 4,
        anim: [
            {
                repeat_random: 10,
                anim: "typing"
            },
            {
                likelihood: 0.2,
                anim: {
                    name: "phone_call",
                    anim: [
                        "phone_rings",
                        {
                            choice: [
                                {
                                    anim: "phone_talk",
                                    dialog: "Hi!"
                                },
                                {
                                    anim: "phone_talk",
                                    dialog: "Hello."
                                }
                            ]
                        },
                        {
                            choice: [
                                {
                                    anim: "phone_talk",
                                    dialog: "How can I help you?",
                                },
                                {
                                    anim: "phone_talk",
                                    dialog: "How can I help?"
                                }
                            ]
                        },
                        "phone_listen",
                        {
                            choice: [
                                {
                                    weight: 0.1,
                                    name: "rare_call",
                                    anim: [
                                        {
                                            choice: [
                                                {
                                                    anim: "phone_talk",
                                                    dialog: "I'm afraid that's not a cup holder. It's for DVDs and CDs."
                                                },
                                                {
                                                    anim: "phone_talk",
                                                    dialog: "I'm not going to tell you what I'm wearing."
                                                }
                                            ]
                                        },
                                        "phone_listen",
                                        {
                                            choice: [
                                                {
                                                    anim: "phone_talk",
                                                    dialog: "Goodbye."
                                                },
                                                {
                                                    anim: "phone_talk",
                                                    dialog: "I'm going to terminate the call now, sir."
                                                }
                                            ]
                                        }
                                    ]
                                },
                                {
                                    name: "common_call",
                                    anim: [
                                        "phone_listen",
                                        {
                                            repeat_random: 2,
                                            anim: [
                                                {
                                                    choice: [
                                                        {
                                                            anim: "phone_talk",
                                                            dialog: "Uh huh."
                                                        },
                                                        {
                                                            anim: "phone_talk",
                                                            dialog: "Yes."
                                                        }
                                                    ]
                                                },
                                                "phone_listen",
                                                {
                                                    choice: [
                                                        {
                                                            anim: "phone_talk",
                                                            dialog: "Have you tried turning it off and on again?"
                                                        },
                                                        {
                                                            anim: "phone_talk",
                                                            dialog: "Is your printer plugged in at the mains?"
                                                        }
                                                    ]
                                                },
                                                "phone_listen",
                                                {
                                                    choice: [
                                                        {
                                                            anim: "phone_talk",
                                                            dialog: "That's it!"
                                                        },
                                                        {
                                                            anim: "phone_talk",
                                                            dialog: "Right."
                                                        }
                                                    ]
                                                }
                                            ]
                                        },
                                        "phone_listen",
                                        {
                                            choice: [
                                                {
                                                    anim: "phone_talk",
                                                    dialog: "I'm glad I could be of help."
                                                },
                                                {
                                                    anim: "phone_talk",
                                                    dialog: "No problem. Thanks for your call."
                                                }
                                            ]
                                        },
                                        {
                                            choice: [
                                                {
                                                    anim: "phone_talk",
                                                    dialog: "Goodbye."
                                                },
                                                {
                                                    anim: "phone_talk",
                                                    dialog: "Bye."
                                                }
                                            ]
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            }
        ]

    }
},
{
    name: "journey_home",
    backdrop: "bus",
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
    backdrop: "kitchen",
    // occurs: {
    //     time: "mon-fri 7 30",
    //     spread: 5
    // },
    anim: [
    "making_dinner",
    {
        repeat_random: 3,
        anim: "eating_dinner"
    }
    ]
},
{
    name: "tv",
    backdrop: "living_room",
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
    backdrop: "bedroom",
    // occurs: {
    //     time: "mon-fri 7 30",
    //     spread: 5
    // },
    anim: {
        repeat_random: 20,
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
