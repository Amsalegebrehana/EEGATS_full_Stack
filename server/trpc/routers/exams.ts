import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../trpc";
import { addMinutes, min } from "date-fns";

// import isOverlapping  from 'date-fns';
import { areIntervalsOverlapping } from 'date-fns'
import { TRPCError } from "@trpc/server";

// reuseble get exam group by Id here

const getExamById = async (ctx: { session: { role: string; }; prisma: { exam: { findUnique: (arg0: { where: { id: any; }; }) => any; }; }; }, id: any) => {
    //  retrieve the exam  by ID
    if (ctx.session.role === "admin") {
      const exam = await ctx.prisma.exam.findUnique({
        where: {
          id: id,
        },
      });
      return exam;
    } else {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "UNAUTHORIZED ACCESS.",
      });
    }
  }
  

export const examRouter = router({

    getExamsCount: protectedProcedure
        .query(async ({ ctx }) => {
            if (ctx.session.role === "admin") {

                return await ctx.prisma.exam.count();

            } else {
                throw new TRPCError({
                    code: "UNAUTHORIZED",
                    message: "UNAUTHORIZED ACCESS.",
                });
            }
        }),
     
    getExamIntervals: publicProcedure 
        .input(
            z.object({
                examGroupId: z.string()
            })
        )
        .query(async ({ ctx , input}) => {
             // get all exams with the same exam group id, pool id 
             const exams = await ctx.prisma.exam.findMany({
                select:{
                    testingDate: true,
                    duration: true,
                    
                },
                where: {
                    examGroup: {
                        id: input.examGroupId,
                    },
                },
            });
            
            //  exams start is testing date and end date is testing date + duration

            const examsDateIntervals = exams.map((exam) => {
                return {
                    start: exam.testingDate,
                    end: new Date(exam.testingDate.getTime() + exam.duration * 60000),
                };
            });
            return examsDateIntervals;
        }),

        // search exams count
     searchExamsCount: protectedProcedure
        .input(
            z.object({
                search: z.string().optional(),
            })
        )
        .query(async ({ ctx, input }) => {
            if (ctx.session.role === "admin") {
                return await ctx.prisma.exam.count({
                    where: {
                        name: {
                            contains: input.search,
                        },
                    },
                });
            } else {
                throw new TRPCError({
                    code: "UNAUTHORIZED",
                    message: "UNAUTHORIZED ACCESS.",
                });
            }
        }),
        //  exams searched
        getSearchedExams : protectedProcedure
        .input(
            z.object({
                skip: z.number(),
                search: z.string().optional(),
            })
        )
        .query(async ({ ctx, input }) => {
            if (ctx.session.role === "admin") {
                return await ctx.prisma.exam.findMany({
                    skip: input.skip,
                    take: 6,
                    orderBy: {
                        createdAt: "desc",
                    },
                    where: {
                        name: {
                            contains: input.search,
                        },
                    },
                });
            } else {
                throw new TRPCError({
                    code: "UNAUTHORIZED",
                    message: "UNAUTHORIZED ACCESS.",
                });
            }
        }),

        // get exams

    getExams: protectedProcedure
        .input(
            z.object({
                skip: z.number(),
                search: z.string().optional(),
            })
        )
        .query(async ({ ctx, input }) => {
            if (ctx.session.role === "admin") {
                
                return await ctx.prisma.exam.findMany({
                    skip: input.skip,
                    take: 6,
                    orderBy: {
                        createdAt: "desc",
                    },
                    where: {
                        name: {
                            contains: input.search,
                        },
                    },
                });
            } else {
                throw new TRPCError({
                    code: 'UNAUTHORIZED',
                    message: 'UNAUTHORIZED ACCESS.',
            
                });
            }

        }),
        // create exam
    createExam: protectedProcedure
        .input(
            z.object({
                name: z.string().min(2).max(255),
                examGroupId: z.string(),
                poolId: z.string(),
                numberOfQuestions: z.number(),
                testingDate: z.date(),
                duration: z.number(),
                examReleaseDate: z.date(),
                categories: z.array(z.object({
                    selectedId: z.string(),
                    numberOfQuestionPerCategory: z.number(),
                })),
            })
        )
        .mutation(async ({ ctx, input }) => {
           
            if (ctx.session.role === "admin") {
            // error handle
                if(!input.name || !input.examGroupId || !input.poolId || !input.numberOfQuestions || !input.testingDate || !input.examReleaseDate || !input.duration || !input.categories){
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message:"Please fill all the required fields."
                    });
                }
                // get all exams with the same exam group id, pool id 
                const previousExams = await ctx.prisma.exam.findMany({
                    select:{
                        testingDate: true,
                        duration: true,
                        
                    },
                    where: {
                        examGroup: {
                            id: input.examGroupId,
                        },
                    },
                });
            
                // previous exams start is testing date and end date is testing date + duration

                const previousExamsDateIntervals = previousExams.map((preExam) => {
                    return {
                        start: preExam.testingDate,
                        end: new Date(preExam.testingDate.getTime() + preExam.duration * 60000),
                    };
                });
                
                // check if the new exam testing date overlaps with any of the previous exams
                const isTestingDateInInterval = previousExamsDateIntervals.some((interval) =>
                    
                    areIntervalsOverlapping(
                            {
                                start: new Date (input.testingDate), 
                                end: new Date ( input.testingDate.getTime() + input.duration * 60000)
                            },

                            {
                                start: new Date(interval.start), 
                                end: new Date (interval.end)
                            }
                        )
                );
        
                // check if the new exam testing date + duration is in the interval of any previous exams
                if (isTestingDateInInterval) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message:"The time slot you picked has another exam scheduled please try to pick another time."
                    });
                }
                // check if the  exam release date is after the testing date
                if(input.examReleaseDate < input.testingDate){

                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message:"The exam release date should be after the testing date."
                    });
                }
                else {  
                        // create exam
                        const newExam = await ctx.prisma.exam.create({
                            data: {
                                name: input.name,
                                examGroupId: input.examGroupId,
                                poolId: input.poolId,
                                numberOfQuestions: input.numberOfQuestions,
                                testingDate: input.testingDate,
                                examReleaseDate: input.examReleaseDate,
                                duration: input.duration,
                                status: "generated",
                            },
                        });
                        // categories for exam
                        // filter aproved questions by category id
                    
                        input.categories.forEach(async (category) => {
                        
                            const approvedQuestions = await ctx.prisma.questions.findMany({  
                                where: {
                                    
                                    catId: category.selectedId,
                                    status: "approved",
                                },
                            });
                    

                        // pick random based on the number of questions
                        
                        const randomApprovedQuestions = [];
                        // shuffle the array
                        for (let i = approvedQuestions.length - 1; i > 0; i--) {

                            const j = Math.floor(Math.random() * (i + 1));
                            [approvedQuestions[i], approvedQuestions[j]] = [approvedQuestions[j], approvedQuestions[i]];
                        };

                        // take the first category.inputValue elements from the shuffled array
                        randomApprovedQuestions.push(...approvedQuestions.slice(0, category.numberOfQuestionPerCategory));

                        // iterate the randomly picked questions then assign the exam id to each question
                        randomApprovedQuestions.forEach(async (question) => {
                        
                            question.examId = newExam.id;
                    
                            question.status = "selected";
                        
                            // then update the question table
                            await ctx.prisma.questions.update({
                                where: {
                                    id: question.id,
                                },
                                data: {
                                    examId: question.examId,
                                    status: question.status
                                },
                            });
                        });

                        }
                    );
                    
                    return newExam;
                }
            } else {
                throw new TRPCError({
                    code: 'UNAUTHORIZED',
                    message: 'UNAUTHORIZED ACCESS.',
                })
            }
        
        }),

        // get exam by id
        getExam: protectedProcedure
            .input(
                z.object({
                    id: z.string(),
                })
            )
            .query(async ({ ctx, input }) => {
                if (ctx.session.role === "admin") {
                return await ctx.prisma.exam.findUnique({
                    where: {
                        id: input.id,
           
                    },
                    include: {
                        examGroup: {
                            select:{
                                name: true
                            },
                        },
                        pool:{
                            select:{
                                name: true
                            },
                        },

                    }
                });
            } else {
                throw new TRPCError({
                    code: 'UNAUTHORIZED',
                    message: 'UNAUTHORIZED ACCESS.',
                })
            }
            }),
            // get all exams by exam group id
        getExamsByExamGroup: protectedProcedure
            .input(
                z.object({
                    id: z.string(),
                    skip: z.number(),
                })
            )
            .query(async ({ ctx, input }) => {
                if (ctx.session.role === "admin") {
                return await ctx.prisma.exam.findMany({
                    skip: input.skip,
                    take: 6,
                    orderBy: {
                        createdAt: "desc",
                    },
                    where: {
                        examGroup: {
                            id: input.id,
                        },
                    },
                });
            } else {
                throw new TRPCError({
                    code: 'UNAUTHORIZED',
                    message: 'UNAUTHORIZED ACCESS.',
                })
            }
            }),
            // get all exams by pool id
        getExamsByPool: protectedProcedure
            .input(
                z.object({
                    id: z.string(),
                    skip: z.number(),
                })
            )
            .query(async ({ ctx, input }) => {
                if (ctx.session.role === "admin") {
                return await ctx.prisma.exam.findMany({
                    skip: input.skip,
                    take: 6,
                    orderBy: {
                        createdAt: "desc",
                    },
                    where: {
                        pool: {
                            id: input.id,
                        },
                    },
                });
            } else {
                throw new TRPCError({
                    code: 'UNAUTHORIZED',
                    message: 'UNAUTHORIZED ACCESS.',
                })
            }
            }),
            publishExam: protectedProcedure
            .input(
                z.object({
                    id: z.string(),
                
                })
            )
            .mutation(async ({ ctx, input }) => {
                if(ctx.session.role === 'admin'){
                    // get exam by id
                    const exam = await getExamById(ctx, input.id);
                    // check if exam exists
                    if (!exam) {
                        throw new TRPCError({
                            code: "NOT_FOUND",
                            message: `Exam with id ${input.id} not found`
                        });
                    }
                    if (exam.testingDate <= new Date()) {
                        throw new  TRPCError({
                            code: "BAD_REQUEST",
                            message: 'Testing date has already passed'
                        });
                    }
                    // change status if testing date is greater than today
                    return await ctx.prisma.exam.update({
                        where: {
                            id: input.id,
                        },
                        data: {
                            status: "published",
                        },
                    });
            } else {
                throw new TRPCError({
                    code: 'UNAUTHORIZED',
                    message: 'UNAUTHORIZED ACCESS.',
                })

            }
            }
            ),
            // unpublish exam
            unPublishExam: protectedProcedure
            .input(
                z.object({
                    id: z.string(),

                })
            )
            .mutation(async ({ ctx, input }) => {
                if (ctx.session.role === "admin") {

                        const exam = await getExamById(ctx, input.id);
                    if (!exam) {
                        throw new TRPCError({
                            code: "NOT_FOUND",
                            message: `Exam with id ${input.id} not found`
                        });
                    }
                    if (exam.testingDate <= new Date()) {
                        throw new  TRPCError({
                            code: "FORBIDDEN",
                            message: 'Testing date has already passed.'
                        });
                    }
                    // change status if testing date is greater than today
                    return await ctx.prisma.exam.update({
                        where: {
                            id: input.id,
                        },
                        data: {
                            status: "generated",
                        },
                    });
            } else {
                throw new TRPCError({
                    code: 'UNAUTHORIZED',
                    message: 'UNAUTHORIZED ACCESS.',
                })
            }
            }
            ),

            // release exam
           
         
});