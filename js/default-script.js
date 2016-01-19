var defaultScript = [
/*
  {
    "name": "get_up",
    "backdrop": "bedroom",
    "anim": [
      "wake_up",
      {
        "repeat_random": 2,
        "anim": "lie_in_bed"
      },
      "get_up"
    ]
  },
  {
    "name": "breakfast",
    "backdrop": "kitchen",
    "anim": {
      "choice": [
        {
          "weight": 0.4,
          "anim": [
            "make_toast",
            {
              "repeat_random": 2,
              "anim": "eat_toast"
            }
          ]
        },
        {
          "anim": [
            "make_cornflakes",
            {
              "repeat_random": 1,
              "anim": "eat_cornflakes"
            },
            {
              "likelihood": 0.4,
              "anim": "open_mail"
            },
            {
              "repeat_random": 1,
              "anim": "eat_cornflakes"
            }
          ]
        }
      ]
    }
  },
  {
    "name": "wash",
    "backdrop": "bathroom",
    "anim": {
      "repeat_random": 2,
      "anim": "washing"
    }
  },
  {
    "name": "journey_to_work",
    "backdrop": "bus",
    "anim": {
      "repeat_random": 5,
      "anim": "riding_bus"
    }
  },*/
  {
    "name": "work",
    "backdrop": "office",
    "anim": {
      "repeat_random": 4,
      "anim": [
        {
          "repeat_random": 10,
          "anim": "type"
        },
        {
          "likelihood": 0.5,
          "anim": {
            "name": "phone_call",
            "anim": [
              "waiting",
              "answerPhone",
              {
                "choice": [
                  {
                    "anim": "talkOnPhone",
                    "dialog": "Hi!"
                  },
                  {
                    "anim": "talkOnPhone",
                    "dialog": "Hello."
                  },
                  {
                    "anim": "talkOnPhone",
                    "dialog": "Hey there!"
                  },
                  {
                    "anim": "talkOnPhone",
                    "dialog": "Good afternoon."
                  },
                  {
                    "anim": "talkOnPhone",
                    "dialog": "User Support."
                  },
                  {
                    "anim": "talkOnPhone",
                    "dialog": "You're through to User Support."
                  },
                  {
                    "anim": "talkOnPhone",
                    "dialog": "You're through to the User Support team."
                  },
                  {
                    "anim": "talkOnPhone",
                    "dialog": "This is Benji from User Support."
                  },
                  {
                    "anim": "talkOnPhone",
                    "dialog": "You're speaking to Benji in User Support."
                  }
                ]
              },
              {
                "choice": [
                  {
                    "anim": "talkOnPhone",
                    "dialog": "How can I help you?"
                  },
                  {
                    "anim": "talkOnPhone",
                    "dialog": "How can I help?"
                  },
                  {
                    "anim": "talkOnPhone",
                    "dialog": "What can I do to help?"
                  },
                  {
                    "anim": "talkOnPhone",
                    "dialog": "What can I help you with?"
                  },
                  {
                    "anim": "talkOnPhone",
                    "dialog": "What can I help with?"
                  },
                  {
                    "anim": "talkOnPhone",
                    "dialog": "What seems to be the problem?"
                  },
                  {
                    "anim": "talkOnPhone",
                    "dialog": "What's the problem?"
                  },
                  {
                    "anim": "talkOnPhone",
                    "dialog": "What do you need help with?"
                  }
                ]
              },
              "phone_listen",
              {
                "choice": [
                  {
                    "weight": 0.1,
                    "name": "rare_call",
                    "anim": [
                      {
                        "choice": [
                          {
                            "anim": "talkOnPhone",
                            "dialog": "I'm afraid that's not a cup holder. It's for DVDs and CDs."
                          },
                          {
                            "anim": "talkOnPhone",
                            "dialog": "I'm not going to tell you what I'm wearing."
                          },
                          [
                            {
                              "anim": "talkOnPhone",
                              "dialog": "Is your mummy or daddy there?"
                            },
                            "phone_listen",
                            {
                              "anim": "talkOnPhone",
                              "dialog": "Please can you pass the phone to them?"
                            }
                          ],
                          {
                            "anim": "talkOnPhone",
                            "dialog": "Uh, I'm afraid I don't have the training to give relationship advice."
                          },
                          [
                            {
                              "anim": "talkOnPhone",
                              "dialog": "No, there's no Seymor Butts here."
                            },
                            "phone_listen",
                            {
                              "anim": "talkOnPhone",
                              "dialog": "And no Amanda Huginkiss either."
                            }
                          ],
                          {
                            "anim": "talkOnPhone",
                            "dialog": "No, this isn't the zoo. No, you can't speak to a 'Mr C Lion'."
                          },
                          [
                            {
                              "anim": "talkOnPhone",
                              "dialog": "Hello."
                            },
                            {
                              "anim": "talkOnPhone",
                              "dialog": "Hellooooo."
                            },
                            "phone_listen",
                            {
                              "anim": "talkOnPhone",
                              "dialog": "HELLOOOOOOO!!!"
                            }
                          ],
                          [
                            {                            
                              "choice": [
                                {
                                  "anim": "talkOnPhone",
                                  "dialog": "I think you have the wrong number."
                                },
                                {
                                  "anim": "talkOnPhone",
                                  "dialog": "I'm afraid you have the wrong number."
                                },
                                {
                                  "anim": "talkOnPhone",
                                  "dialog": "I'm sorry, you have the wrong number."
                                }
                              ],
                              "choice": [
                                {
                                  "anim": "talkOnPhone",
                                  "dialog": "This isn't Paul's Pizza Place."
                                },
                                {
                                  "anim": "talkOnPhone",
                                  "dialog": "This isn't Wendy's windscreen replacement shop."
                                },
                                {
                                  "anim": "talkOnPhone",
                                  "dialog": "This isn't the Turkish baths."
                                },
                                {
                                  "anim": "talkOnPhone",
                                  "dialog": "This isn't MI6."
                                },
                                {
                                  "anim": "talkOnPhone",
                                  "dialog": "This isn't Sally's Salsa Club."
                                },
                                {
                                  "anim": "talkOnPhone",
                                  "dialog": "This isn't the police station."
                                },
                                {
                                  "anim": "talkOnPhone",
                                  "dialog": "This isn't Teddy's Tavern."
                                },
                                {
                                  "anim": "talkOnPhone",
                                  "dialog": "This isn't Abra-kebab-ra."
                                },
                                {
                                  "anim": "talkOnPhone",
                                  "dialog": "This isn't a secret nuclear bunker."
                                },
                                {
                                  "anim": "talkOnPhone",
                                  "dialog": "This isn't Buckingham Palace."
                                },
                                {
                                  "anim": "talkOnPhone",
                                  "dialog": "I'm not a talking dog."
                                },
                                {
                                  "anim": "talkOnPhone",
                                  "dialog": "I'm not the Pope."
                                },
                                {
                                  "anim": "talkOnPhone",
                                  "dialog": "I'm not Indiana Jones."
                                },
                                {
                                  "anim": "talkOnPhone",
                                  "dialog": "I'm not the Jamaican Bobsleigh Team coach."
                                },
                                {
                                  "anim": "talkOnPhone",
                                  "dialog": "I'm not Darth Vader."
                                },
                                {
                                  "anim": "talkOnPhone",
                                  "dialog": "I'm not Harry Potter."
                                },
                                {
                                  "anim": "talkOnPhone",
                                  "dialog": "I'm not the Prime Minister."
                                }
                              ]
                            }
                          ]
                        ]
                      },
                      "phone_listen",
                      {
                        "choice": [
                          {
                            "anim": "talkOnPhone",
                            "dialog": "Goodbye."
                          },
                          {
                            "anim": "talkOnPhone",
                            "dialog": "Bye."
                          },
                          {
                            "anim": "talkOnPhone",
                            "dialog": "I'm going to terminate the call now, madam."
                          },
                          {
                            "anim": "talkOnPhone",
                            "dialog": "I'm going to terminate the call now, sir."
                          }
                        ]
                      }
                    ]
                  },
                  {
                    "name": "common_call",
                    "anim": [
                      "phone_listen",
                      {
                        "repeat_random": 2,
                        "anim": [
                          {
                            "choice": [
                              {
                                "anim": "talkOnPhone",
                                "dialog": "Uh huh."
                              },
                              {
                                "anim": "talkOnPhone",
                                "dialog": "Yes."
                              },
                              {
                                "anim": "talkOnPhone",
                                "dialog": "Go on."
                              },
                              {
                                "anim": "talkOnPhone",
                                "dialog": "Carry on."
                              },
                              {
                                "anim": "talkOnPhone",
                                "dialog": "Okay."
                              },
                              {
                                "anim": "talkOnPhone",
                                "dialog": "Right."
                              },
                              {
                                "anim": "talkOnPhone",
                                "dialog": "Righto."
                              },
                              {
                                "anim": "talkOnPhone",
                                "dialog": "Yeah, okay."
                              },
                              {
                                "anim": "talkOnPhone",
                                "dialog": "Yeah."
                              }
                            ]
                          },
                          "phone_listen",
                          {
                            "choice": [
                              {
                                "anim": "talkOnPhone",
                                "dialog": "Have you tried turning it off and on again?"
                              },
                              [
                                {
                                  "anim": "talkOnPhone",
                                  "dialog": "Is your computer plugged in at the mains?"
                                },
                                "phone_listen",
                                {
                                  "anim": "talkOnPhone",
                                  "dialog": "Is the mains switch turned on?"
                                }
                              ],
                              {
                                "anim": "talkOnPhone",
                                "dialog": "There isn't an 'any key'. Just press a key of your choice."
                              },
                              [
                                {
                                  "anim": "talkOnPhone",
                                  "dialog": "Let me just take over control of your system and update the driver."
                                },
                                "type",
                                {
                                  "anim": "talkOnPhone",
                                  "dialog": "All done."
                                }
                              ],
                              [
                                {
                                  "anim": "talkOnPhone",
                                  "dialog": "Let me just take control of your system and fix that."
                                },
                                "type",
                                {
                                  "anim": "talkOnPhone",
                                  "dialog": "All done."
                                }
                              ],
                              {
                                "anim": "talkOnPhone",
                                "dialog": "Ok, so click on the little blue 'e' at the bottom of your screen."
                              },
                              [
                                {
                                  "anim": "talkOnPhone",
                                  "dialog": "Right, you'll need to press the ON button."
                                },
                                "phone_listen",
                                {
                                  "anim": "talkOnPhone",
                                  "dialog": "It's a nearly-complete circle with a line through it."
                                }
                              ],
                              {
                                "anim": "talkOnPhone",
                                "dialog": "Have you tried restarting your computer?"
                              },
                              [
                                {
                                  "anim": "talkOnPhone",
                                  "dialog": "It sounds like you have some unwanted Adware on your system. I'll just take over and remove it."
                                },
                                "type",
                                {
                                  "anim": "talkOnPhone",
                                  "dialog": "Done."
                                }
                              ],
                              [
                                {
                                  "anim": "talkOnPhone",
                                  "dialog": "Yes, type your username in the first box."
                                },
                                "phone_listen",
                                {
                                  "anim": "talkOnPhone",
                                  "dialog": "Then your password in the next box."
                                },
                                {
                                  "anim": "talkOnPhone",
                                  "dialog": "Yes, click in the next box and type in your password."
                                }
                              ],
                              {
                                "anim": "talkOnPhone",
                                "dialog": "Have you changed your printer cartridge recently?"
                              },
                              [
                                {
                                  "anim": "talkOnPhone",
                                  "dialog": "Ok, click on the 'compose' button. A new window should appear."
                                },
                                "phone_listen",
                                {
                                  "anim": "talkOnPhone",
                                  "dialog": "Who do you want to send the email to?"
                                },
                                "phone_listen",
                                {
                                  "anim": "talkOnPhone",
                                  "dialog": "So, type in their email address."
                                },
                                "phone_listen",
                                {
                                  "anim": "talkOnPhone",
                                  "dialog": "In the 'to' box, near the top."
                                },
                                "phone_listen",
                                {
                                  "anim": "talkOnPhone",
                                  "dialog": "Then your password in the next box."
                                },
                                "phone_listen",
                                {
                                  "anim": "talkOnPhone",
                                  "dialog": "Now, you can type a subject in the 'subject' box."
                                },
                                "phone_listen",
                                {
                                  "anim": "talkOnPhone",
                                  "dialog": "Any subject you like. What is your email about?"
                                },
                                "phone_listen",
                                {
                                  "anim": "talkOnPhone",
                                  "dialog": "Ok. Now, in the big box at the bottom, you can type the rest of your message."
                                },
                                "phone_listen",
                                {
                                  "anim": "talkOnPhone",
                                  "dialog": "When you've finished, you can click on 'send'."
                                }
                              ],
                              [
                                {
                                  "anim": "talkOnPhone",
                                  "dialog": "Ok, so plug the memory stick in to the USB slot in the side of your laptop."
                                },
                                "phone_listen",
                                {
                                  "anim": "talkOnPhone",
                                  "dialog": "The slot's about a centimetre wide, and about half as high."
                                },
                                {
                                  "anim": "talkOnPhone",
                                  "dialog": "Yes, a similar size to the memory stick itself."
                                }
                              ],
                              [
                                {
                                  "anim": "talkOnPhone",
                                  "dialog": "Sure, I'll just reset your password for you."
                                },
                                "type",
                                {
                                  "anim": "talkOnPhone",
                                  "dialog": "There you go."
                                }
                              ]
                            ]
                          },
                          "phone_listen",
                          {
                            "choice": [
                              {
                                "anim": "talkOnPhone",
                                "dialog": "That's it!"
                              },
                              {
                                "anim": "talkOnPhone",
                                "dialog": "Right."
                              },
                              {
                                "anim": "talkOnPhone",
                                "dialog": "Yes, that's it."
                              },
                              {
                                "anim": "talkOnPhone",
                                "dialog": "That's right."
                              },
                              {
                                "anim": "talkOnPhone",
                                "dialog": "Uh huh."
                              },
                              {
                                "anim": "talkOnPhone",
                                "dialog": "Yup, you've got it."
                              }
                            ]
                          }
                        ]
                      },
                      "phone_listen",
                      {
                        "choice": [
                          {
                            "anim": "talkOnPhone",
                            "dialog": "I'm glad I could be of help."
                          },
                          {
                            "anim": "talkOnPhone",
                            "dialog": "No problem. Thanks for your call."
                          },
                          {
                            "anim": "talkOnPhone",
                            "dialog": "Happy to help."
                          },
                          {
                            "anim": "talkOnPhone",
                            "dialog": "Well, thank you for calling."
                          },
                          {
                            "anim": "talkOnPhone",
                            "dialog": "I'm glad I could help."
                          },
                          {
                            "anim": "talkOnPhone",
                            "dialog": "Happy to be of service."
                          }
                        ]
                      },
                      {
                        "choice": [
                          {
                            "anim": "talkOnPhone",
                            "dialog": "Goodbye."
                          },
                          {
                            "anim": "talkOnPhone",
                            "dialog": "Bye."
                          },
                          {
                            "anim": "talkOnPhone",
                            "dialog": "Thanks, bye!"
                          },
                          {
                            "anim": "talkOnPhone",
                            "dialog": "Thank you, bye!"
                          },
                          {
                            "anim": "talkOnPhone",
                            "dialog": "Cheerio!"
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
  }/*,
  {
    "name": "journey_home",
    "backdrop": "bus",
    "anim": {
      "repeat_random": 5,
      "anim": "riding_bus"
    }
  },
  {
    "name": "dinner",
    "backdrop": "kitchen",
    "anim": [
      "making_dinner",
      {
        "repeat_random": 3,
        "anim": "eating_dinner"
      }
    ]
  },
  {
    "name": "tv",
    "backdrop": "living_room",
    "anim": {
      "repeat_random": 5,
      "anim": "watching_tv"
    }
  },
  {
    "name": "sleep",
    "backdrop": "bedroom",
    "anim": {
      "repeat_random": 20,
      "anim": "sleeping"
    }
  }*/
];
