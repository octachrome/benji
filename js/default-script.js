var defaultScript = [
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
  },
  {
    "name": "work",
    "backdrop": "office",
    "anim": {
      "repeat_random": 4,
      "anim": [
        {
          "repeat_random": 10,
          "anim": "typing"
        },
        {
          "likelihood": 0.2,
          "anim": {
            "name": "phone_call",
            "anim": [
              "phone_rings",
              {
                "choice": [
                  {
                    "anim": "phone_talk",
                    "dialog": "Hi!"
                  },
                  {
                    "anim": "phone_talk",
                    "dialog": "Hello."
                  },
                  {
                    "anim": "phone_talk",
                    "dialog": "Hey there!"
                  },
                  {
                    "anim": "phone_talk",
                    "dialog": "Good afternoon."
                  },
                  {
                    "anim": "phone_talk",
                    "dialog": "User Support."
                  },
                  {
                    "anim": "phone_talk",
                    "dialog": "You're through to User Support."
                  },
                  {
                    "anim": "phone_talk",
                    "dialog": "You're through to the User Support team."
                  },
                  {
                    "anim": "phone_talk",
                    "dialog": "This is Benji from User Support."
                  },
                  {
                    "anim": "phone_talk",
                    "dialog": "You're speaking to Benji in User Support."
                  }
                ]
              },
              {
                "choice": [
                  {
                    "anim": "phone_talk",
                    "dialog": "How can I help you?"
                  },
                  {
                    "anim": "phone_talk",
                    "dialog": "How can I help?"
                  },
                  {
                    "anim": "phone_talk",
                    "dialog": "What can I do to help?"
                  },
                  {
                    "anim": "phone_talk",
                    "dialog": "What can I help you with?"
                  },
                  {
                    "anim": "phone_talk",
                    "dialog": "What can I help with?"
                  },
                  {
                    "anim": "phone_talk",
                    "dialog": "What seems to be the problem?"
                  },
                  {
                    "anim": "phone_talk",
                    "dialog": "What's the problem?"
                  },
                  {
                    "anim": "phone_talk",
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
                            "anim": "phone_talk",
                            "dialog": "I'm afraid that's not a cup holder. It's for DVDs and CDs."
                          },
                          {
                            "anim": "phone_talk",
                            "dialog": "I'm not going to tell you what I'm wearing."
                          },
                          [
                            {
                              "anim": "phone_talk",
                              "dialog": "Is your mummy or daddy there?"
                            },
                            "phone_listen",
                            {
                              "anim": "phone_talk",
                              "dialog": "Please can you pass the phone to them?"
                            }
                          ],
                          {
                            "anim": "phone_talk",
                            "dialog": "Uh, I'm afraid I don't have the training to give relationship advice."
                          },
                          [
                            {
                              "anim": "phone_talk",
                              "dialog": "No, there's no Seymor Butts here."
                            },
                            "phone_listen",
                            {
                              "anim": "phone_talk",
                              "dialog": "And no Amanda Huginkiss either."
                            }
                          ],
                          {
                            "anim": "phone_talk",
                            "dialog": "No, this isn't the zoo. No, you can't speak to a 'Mr C Lion'."
                          },
                          [
                            {
                              "anim": "phone_talk",
                              "dialog": "Hello."
                            },
                            {
                              "anim": "phone_talk",
                              "dialog": "Hellooooo."
                            },
                            "phone_listen",
                            {
                              "anim": "phone_talk",
                              "dialog": "HELLOOOOOOO!!!"
                            }
                          ],
                          [
                            {                            
                              "choice": [
                                {
                                  "anim": "phone_talk",
                                  "dialog": "I think you have the wrong number."
                                },
                                {
                                  "anim": "phone_talk",
                                  "dialog": "I'm afraid you have the wrong number."
                                },
                                {
                                  "anim": "phone_talk",
                                  "dialog": "I'm sorry, you have the wrong number."
                                }
                              ],
                              "choice": [
                                {
                                  "anim": "phone_talk",
                                  "dialog": "This isn't Paul's Pizza Place."
                                },
                                {
                                  "anim": "phone_talk",
                                  "dialog": "This isn't Wendy's windscreen replacement shop."
                                },
                                {
                                  "anim": "phone_talk",
                                  "dialog": "This isn't the Turkish baths."
                                },
                                {
                                  "anim": "phone_talk",
                                  "dialog": "This isn't MI6."
                                },
                                {
                                  "anim": "phone_talk",
                                  "dialog": "This isn't Sally's Salsa Club."
                                },
                                {
                                  "anim": "phone_talk",
                                  "dialog": "This isn't the police station."
                                },
                                {
                                  "anim": "phone_talk",
                                  "dialog": "This isn't Teddy's Tavern."
                                },
                                {
                                  "anim": "phone_talk",
                                  "dialog": "This isn't Abra-kebab-ra."
                                },
                                {
                                  "anim": "phone_talk",
                                  "dialog": "This isn't a secret nuclear bunker."
                                },
                                {
                                  "anim": "phone_talk",
                                  "dialog": "This isn't Buckingham Palace."
                                },
                                {
                                  "anim": "phone_talk",
                                  "dialog": "I'm not a talking dog."
                                },
                                {
                                  "anim": "phone_talk",
                                  "dialog": "I'm not the Pope."
                                },
                                {
                                  "anim": "phone_talk",
                                  "dialog": "I'm not Indiana Jones."
                                },
                                {
                                  "anim": "phone_talk",
                                  "dialog": "I'm not the Jamaican Bobsleigh Team coach."
                                },
                                {
                                  "anim": "phone_talk",
                                  "dialog": "I'm not Darth Vader."
                                },
                                {
                                  "anim": "phone_talk",
                                  "dialog": "I'm not Harry Potter."
                                },
                                {
                                  "anim": "phone_talk",
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
                            "anim": "phone_talk",
                            "dialog": "Goodbye."
                          },
                          {
                            "anim": "phone_talk",
                            "dialog": "Bye."
                          },
                          {
                            "anim": "phone_talk",
                            "dialog": "I'm going to terminate the call now, madam."
                          },
                          {
                            "anim": "phone_talk",
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
                                "anim": "phone_talk",
                                "dialog": "Uh huh."
                              },
                              {
                                "anim": "phone_talk",
                                "dialog": "Yes."
                              },
                              {
                                "anim": "phone_talk",
                                "dialog": "Go on."
                              },
                              {
                                "anim": "phone_talk",
                                "dialog": "Carry on."
                              },
                              {
                                "anim": "phone_talk",
                                "dialog": "Okay."
                              },
                              {
                                "anim": "phone_talk",
                                "dialog": "Right."
                              },
                              {
                                "anim": "phone_talk",
                                "dialog": "Righto."
                              },
                              {
                                "anim": "phone_talk",
                                "dialog": "Yeah, okay."
                              },
                              {
                                "anim": "phone_talk",
                                "dialog": "Yeah."
                              }
                            ]
                          },
                          "phone_listen",
                          {
                            "choice": [
                              {
                                "anim": "phone_talk",
                                "dialog": "Have you tried turning it off and on again?"
                              },
                              [
                                {
                                  "anim": "phone_talk",
                                  "dialog": "Is your computer plugged in at the mains?"
                                },
                                "phone_listen",
                                {
                                  "anim": "phone_talk",
                                  "dialog": "Is the mains switch turned on?"
                                }
                              ],
                              {
                                "anim": "phone_talk",
                                "dialog": "There isn't an 'any key'. Just press a key of your choice."
                              },
                              [
                                {
                                  "anim": "phone_talk",
                                  "dialog": "Let me just take over control of your system and update the driver."
                                },
                                "typing",
                                {
                                  "anim": "phone_talk",
                                  "dialog": "All done."
                                }
                              ],
                              [
                                {
                                  "anim": "phone_talk",
                                  "dialog": "Let me just take control of your system and fix that."
                                },
                                "typing",
                                {
                                  "anim": "phone_talk",
                                  "dialog": "All done."
                                }
                              ],
                              {
                                "anim": "phone_talk",
                                "dialog": "Ok, so click on the little blue 'e' at the bottom of your screen."
                              },
                              [
                                {
                                  "anim": "phone_talk",
                                  "dialog": "Right, you'll need to press the ON button."
                                },
                                "phone_listen",
                                {
                                  "anim": "phone_talk",
                                  "dialog": "It's a nearly-complete circle with a line through it."
                                }
                              ],
                              {
                                "anim": "phone_talk",
                                "dialog": "Have you tried restarting your computer?"
                              },
                              [
                                {
                                  "anim": "phone_talk",
                                  "dialog": "It sounds like you have some unwanted Adware on your system. I'll just take over and remove it."
                                },
                                "typing",
                                {
                                  "anim": "phone_talk",
                                  "dialog": "Done."
                                }
                              ],
                              [
                                {
                                  "anim": "phone_talk",
                                  "dialog": "Yes, type your username in the first box."
                                },
                                "phone_listen",
                                {
                                  "anim": "phone_talk",
                                  "dialog": "Then your password in the next box."
                                },
                                {
                                  "anim": "phone_talk",
                                  "dialog": "Yes, click in the next box and type in your password."
                                }
                              ],
                              {
                                "anim": "phone_talk",
                                "dialog": "Have you changed your printer cartridge recently?"
                              },
                              [
                                {
                                  "anim": "phone_talk",
                                  "dialog": "Ok, click on the 'compose' button. A new window should appear."
                                },
                                "phone_listen",
                                {
                                  "anim": "phone_talk",
                                  "dialog": "Who do you want to send the email to?"
                                },
                                "phone_listen",
                                {
                                  "anim": "phone_talk",
                                  "dialog": "So, type in their email address."
                                },
                                "phone_listen",
                                {
                                  "anim": "phone_talk",
                                  "dialog": "In the 'to' box, near the top."
                                },
                                "phone_listen",
                                {
                                  "anim": "phone_talk",
                                  "dialog": "Then your password in the next box."
                                },
                                "phone_listen",
                                {
                                  "anim": "phone_talk",
                                  "dialog": "Now, you can type a subject in the 'subject' box."
                                },
                                "phone_listen",
                                {
                                  "anim": "phone_talk",
                                  "dialog": "Any subject you like. What is your email about?"
                                },
                                "phone_listen",
                                {
                                  "anim": "phone_talk",
                                  "dialog": "Ok. Now, in the big box at the bottom, you can type the rest of your message."
                                },
                                "phone_listen",
                                {
                                  "anim": "phone_talk",
                                  "dialog": "When you've finished, you can click on 'send'."
                                }
                              ],
                              [
                                {
                                  "anim": "phone_talk",
                                  "dialog": "Ok, so plug the memory stick in to the USB slot in the side of your laptop."
                                },
                                "phone_listen",
                                {
                                  "anim": "phone_talk",
                                  "dialog": "The slot's about a centimetre wide, and about half as high."
                                },
                                {
                                  "anim": "phone_talk",
                                  "dialog": "Yes, a similar size to the memory stick itself."
                                }
                              ],
                              [
                                {
                                  "anim": "phone_talk",
                                  "dialog": "Sure, I'll just reset your password for you."
                                },
                                "typing",
                                {
                                  "anim": "phone_talk",
                                  "dialog": "There you go."
                                }
                              ]
                            ]
                          },
                          "phone_listen",
                          {
                            "choice": [
                              {
                                "anim": "phone_talk",
                                "dialog": "That's it!"
                              },
                              {
                                "anim": "phone_talk",
                                "dialog": "Right."
                              },
                              {
                                "anim": "phone_talk",
                                "dialog": "Yes, that's it."
                              },
                              {
                                "anim": "phone_talk",
                                "dialog": "That's right."
                              },
                              {
                                "anim": "phone_talk",
                                "dialog": "Uh huh."
                              },
                              {
                                "anim": "phone_talk",
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
                            "anim": "phone_talk",
                            "dialog": "I'm glad I could be of help."
                          },
                          {
                            "anim": "phone_talk",
                            "dialog": "No problem. Thanks for your call."
                          },
                          {
                            "anim": "phone_talk",
                            "dialog": "Happy to help."
                          },
                          {
                            "anim": "phone_talk",
                            "dialog": "Well, thank you for calling."
                          },
                          {
                            "anim": "phone_talk",
                            "dialog": "I'm glad I could help."
                          },
                          {
                            "anim": "phone_talk",
                            "dialog": "Happy to be of service."
                          }
                        ]
                      },
                      {
                        "choice": [
                          {
                            "anim": "phone_talk",
                            "dialog": "Goodbye."
                          },
                          {
                            "anim": "phone_talk",
                            "dialog": "Bye."
                          },
                          {
                            "anim": "phone_talk",
                            "dialog": "Thanks, bye!"
                          },
                          {
                            "anim": "phone_talk",
                            "dialog": "Thank you, bye!"
                          },
                          {
                            "anim": "phone_talk",
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
  },
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
  }
];
