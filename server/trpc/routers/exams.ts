import { z } from "zod";
import { publicProcedure, router } from "../trpc";

export const examRouter = router({
    getExamsCount: publicProcedure.query(async ({ ctx }) => {
      return await ctx.prisma.exam.count();
    }),
    getExams: publicProcedure
        .input(
            z.object({
                skip: z.number(),
                search: z.string().optional()
            })
        )
        .query(async ({ ctx, input }) => {
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
        }),
        // create exam
    createExam: publicProcedure
        .input(
            z.object({
                name: z.string(),
                examGroupId: z.string(),
                poolId: z.string(),
                numberOfQuestions: z.number(),
                testingDate: z.date(),
                duration: z.number(),
                categories: z.array(z.object({
                    selectedId: z.string(),
                    numberOfQuestionPerCategory: z.number(),
                })),
            })
        )
        .mutation(async ({ ctx, input }) => {
           

            const data = await ctx.prisma.exam.create({
                data: {
                    name: input.name,
                    examGroupId: input.examGroupId,
                    poolId: input.poolId,
                    numberOfQuestions: input.numberOfQuestions,
                    testingDate: input.testingDate,
                    duration: input.duration,
                    status: "generated",
                },
            });
            // categories for exam
            // filter aproved questions by category id
            // assign each approved questions the create exam id
            // filter questions by category id
         
            
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
                  
                    question.examId = data.id;
               
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
            return data;
        }),
        // get exam by id
        getExam: publicProcedure
            .input(
                z.object({
                    id: z.string(),
                })
            )
            .query(async ({ ctx, input }) => {
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
            }),
            // get all exams by exam group id
        getExamsByExamGroup: publicProcedure
            .input(
                z.object({
                    id: z.string(),
                    skip: z.number(),
                })
            )
            .query(async ({ ctx, input }) => {
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
            }),
            // get all exams by pool id
        getExamsByPool: publicProcedure
            .input(
                z.object({
                    id: z.string(),
                    skip: z.number(),
                })
            )
            .query(async ({ ctx, input }) => {
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
            }),
            publishExam: publicProcedure
            .input(
                z.object({
                    id: z.string(),
                
                })
            )
            .mutation(async ({ ctx, input }) => {
                const exam = await ctx.prisma.exam.findUnique({
                    where: {
                        id: input.id,

                    },
                });
                if (!exam) {
                    throw new Error(`Exam with id ${input.id} not found`);
                }
                if (exam.testingDate <= new Date()) {
                    throw new Error('Testing date has already passed');
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
            }
            ),
            // unpublish exam
            unPublishExam: publicProcedure
            .input(
                z.object({
                    id: z.string(),

                })
            )
            .mutation(async ({ ctx, input }) => {
                const exam = await ctx.prisma.exam.findUnique({
                    where: {
                        id: input.id,
                    },
                });
                if (!exam) {
                    throw new Error(`Exam with id ${input.id} not found`);
                }
                if (exam.testingDate <= new Date()) {
                    throw new Error('Testing date has already passed');
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
            }
            ),

            // release exam
            releaseExam: publicProcedure
            .input(
                z.object({
                    id: z.string(),
                })
            )
            .mutation(async ({ ctx, input }) => {

                const exam = await ctx.prisma.exam.findUnique({
                    where: {
                        id: input.id,
                    },
                });

                if (!exam) {
                    throw new Error(`Exam with id ${input.id} not found`);
                }
                // check if testing are already taken or not
                const twoDaysLater = new Date(exam.testingDate.getTime() + 2 * 24 * 60 * 60 * 1000);

                if (new Date()  < twoDaysLater) {
                    throw new Error('Testing date has not yet passed');
                }
                // change status if testing date is greater than today
                return await ctx.prisma.exam.update({
                    where: {
                        id: input.id,
                    },
                    data: {
                        status: "gradeReleased",
                    },
                });
            }
            ),
         
});