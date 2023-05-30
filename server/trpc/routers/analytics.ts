import { z } from "zod";
import { protectedProcedure, router } from "../trpc";
import { TRPCError } from "@trpc/server";
import { ChartData, ChartDataset } from 'chart.js';
import { Category, Pool, Contributors } from '@prisma/client';
import { filter } from "./reviews";

interface CategoryCounts {
  [categoryName: string]: number;
}

interface ResultItem {
  id: string;
  pool:string;
  name: string;
  numOfQuestions: number;
  categories: CategoryCounts;
  grade: number;
  testTime?: number;
  testDuration?: number,
  ranking?: number,
  chartData?: { data: ChartData<"doughnut", number[], unknown>, options?: any };

}
function generateRandomColors(numOfEntries: number, includeBlack: boolean): string[] {
  const colors: string[] = [];

  for (let i = 0; i < numOfEntries; i++) {
    const color = '#' + Math.floor(Math.random() * 16777215).toString(16);
    colors.push(color);
  }
  if (includeBlack) {
    colors.pop();
    colors.push('#000000');
  }

  return colors;
}

export const analyticsRouter = router({
  getTestTakerResults: protectedProcedure
    .input(z.object({
      testTakerId: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      if (ctx.session.role === 'admin') {
        const testTaker = await ctx.prisma.testTakers.findUnique({
          where: {
            id: input.testTakerId,
          }
        });
        const data = await ctx.prisma.exam.findMany({
          orderBy: {
            createdAt: "desc",
          },
          where: {
            examGroup: {
              id: testTaker?.examGroupId
            },
            status: {
              not: 'generated'
            }
          },
          select: {
            id: true,
            name: true,
            numberOfQuestions: true,
            duration: true,
            pool:{
              select:{
                name:true
              }
            },
            TestSession: {
              where:
              {
                testTakerId: input.testTakerId,
                isSubmitted: true
              },
              select: {
                testTakers: {
                  select: {
                    username: true,
                    id: true
                  }
                },
                grade: true,
                updatedAt: true,
                createdAt: true
              }

            },
            TestTakerResponse: {
              where: {
                testTakerId: input.testTakerId,
                isCorrect: true
              },
              select: {
                questions: {
                  select: {
                    category: {
                      select: {
                        name: true
                      }
                    }
                  }
                }

              }
            },
          }

        }).then((data) => {
          if (data) {
            console.log("data", data);
            const result: ResultItem[] = [];
            const username = testTaker?.username;
            const grades: number[] = [];
            data.forEach(async (item) => {
              const unansweredCategoryName = "Incorrect";
              const correctCount = 0;
              let unansweredCount = item.numberOfQuestions - item.TestTakerResponse.length;

              const testDuration = item.duration;
              const testTime = Math.abs(Math.round((item.TestSession[0].updatedAt.getTime() - item.TestSession[0].createdAt.getTime()) / 60000));
              const categoryCounts: CategoryCounts = {};
              const testTakerIndex = item.TestSession.findIndex((session) => session.testTakers.id === input.testTakerId);
              var ranking;
              // If the test taker's test session is found, return the ranking
              if (testTakerIndex !== -1) {
                ranking = testTakerIndex + 1;
              }
              item.TestTakerResponse.forEach((response) => {
                const categoryName = response.questions.category.name;

                if (categoryCounts.hasOwnProperty(categoryName)) {
                  categoryCounts[categoryName]++;
                } else {
                  categoryCounts[categoryName] = 1;
                }
              });

              if (unansweredCount > 0) {
                categoryCounts[unansweredCategoryName] = unansweredCount;
              }

              const chartData: ChartData<"doughnut", number[], unknown> = {
                labels: [],
                datasets: [{
                  data: [],
                  backgroundColor: [],
                }],
              };

              Object.entries(categoryCounts).forEach(([category, count], index) => {
                chartData.labels?.push(category);
                chartData.datasets[0].data.push(count);
              });
              chartData.datasets[0].backgroundColor = generateRandomColors(chartData.labels?.length || 0, unansweredCount > 0);
              const grade = (item.TestSession[0].grade / item.numberOfQuestions) * 100;
              grades.push(grade);

              result.push({
                id: item.id,
                name: item.name,
                pool: item.pool.name,
                numOfQuestions: item.numberOfQuestions,
                categories: categoryCounts,
                grade,
                testTime,
                testDuration,
                chartData: {
                  data: chartData,
                  options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                      legend: {
                        position: 'right',

                      },
                    },
                  }
                },

              });
            });
            const averageGrade = grades.reduce((sum, grade) => sum + grade, 0) / grades.length;
            const highestGrade = Math.max(...grades);
            const lowestGrade = Math.min(...grades);

            return {
              result,
              averageGrade,
              highestGrade,
              lowestGrade,
              username,
            };

          }

        });
        return data;
      } else {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'UNAUTHORIZED ACCESS.',

        });
      }

    }),

  getPoolAnalytics: protectedProcedure
    .input(z.object({
      poolId: z.string()
    }))
    .query(
      async ({ ctx, input }) => {
        try {
          const pool = await ctx.prisma.pool.findUnique({
            where: { id: input.poolId },
            include: {
              Contributors: {
                include: { Questions: true },
                orderBy: { Questions: { _count: 'desc' } },

              },
              Category: {
                include: { questions: true },
                orderBy: { questions: { _count: 'desc' } },
              },
              Exam: true
            }
          });

          if (!pool) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Pool not found',

            });
          }

          const contributorCount: number = pool.Contributors.length;

          const categoryDistribution: { categoryName: string; totalQuestions: number }[] = pool.Category.map(
            (category) => ({
              categoryName: category.name,
              totalQuestions: category.questions.length
            })
          );

          const examCount: number = pool.Exam.length;

          const totalQuestions: number = pool.Category.reduce((total, category) => total + category.questions.length, 0);

          const topContributors: { contributorName: string; contributionPercentage: number }[] = pool.Contributors
            .map(contributor => ({
              contributorName: contributor.name,
              contributionPercentage: (contributor.Questions.length / totalQuestions) * 100
            }))
            .sort((a, b) => b.contributionPercentage - a.contributionPercentage)
            .slice(0, 3);


          const topCategories: { categoryName: string; totalQuestions: number }[] = pool.Category
            .sort((a, b) => b.questions.length - a.questions.length)
            .map((category) => ({
              categoryName: category.name,
              totalQuestions: category.questions.length
            }))
            .slice(0, 3);

          const questionStatusMetrics: { [status: string]: number } = {};

          pool.Category.forEach((category) => {
            category.questions.forEach((question) => {
              if (!questionStatusMetrics[question.status]) {
                questionStatusMetrics[question.status] = 0;
              }
              questionStatusMetrics[question.status]++;
            });
          });

          const chartData: ChartData<"doughnut", number[], unknown> = {
            labels: [],
            datasets: [{
              data: [],
              backgroundColor: [],
            }],
          };

          Object.entries(questionStatusMetrics).forEach(([status, count], index) => {
            chartData.labels?.push(status);
            chartData.datasets[0].data.push(count);
          });
          chartData.datasets[0].backgroundColor = generateRandomColors(chartData.labels?.length || 0, false);

          const categoryLabels: string[] = categoryDistribution.map((category) => category.categoryName);
          const categoryCounts: number[] = categoryDistribution.map((category) => category.totalQuestions);

          const categoryDistributionChartData: ChartData<"bar", number[], unknown> = {
            labels: categoryLabels,
            datasets: [
              {
                label: 'Total Questions',
                data: categoryCounts,
                backgroundColor: generateRandomColors(categoryCounts.length, false)
              }
            ]
          };
          const totalApprovedQuestions: number = questionStatusMetrics.approved || 0;

          const isEmptyDistribution = Object.keys(questionStatusMetrics).length === 0;
          const isEmptyBarDistribution = Object.keys(categoryCounts).length === 0;

          return {
            contributorCount,
            categoryDistribution,
            examCount,
            topContributors,
            topCategories,
            questionStatusMetrics,
            totalApprovedQuestions,
            poolName: pool.name,
            statusDistribution: {
              data: chartData,
              options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                  title: {
                    display: true,
                    text: isEmptyDistribution ?'No Questions Found' : 'Question Status Distribution',
                    font: {
                      size: 22,
                      weight: 'bold',
                    },
                  },
                  legend: {
                    position: 'right',

                  },
                },
              }
            },
            catDistribution: {
              data: categoryDistributionChartData,
              options: {
                responsive: true,
                maintainAspectRatio: true,
                scales: {
                  x: {
                    grid: {
                      display: false // Hide the x-axis grid lines
                    }
                  },
                  y: {
                    grid: {
                      display: false // Hide the y-axis grid lines
                    }
                  }
                },
                plugins: {
                  title: {
                    display: true,
                    text: isEmptyBarDistribution ? 'No Questions Found':'Category Distribution',
                    font: {
                      size: 22,
                      weight: 'bold',
                    },
                  },
                  legend: {
                    display: false,
                  },
                },
              }
            },
          };
        } catch (error) {
          console.error('Error retrieving pool data:', error);
          throw error;
        }

      }
    ),

  getExamAnalytics: protectedProcedure
    .input(z.object({
      examId: z.string()
    }))
    .query(async ({ ctx, input }) => {
      try {
        const exam = await ctx.prisma.exam.findUnique({
          where: { id: input.examId },
          include: {
            TestSession: {
              where: { isSubmitted: true },
            },
            Questions: {
              include: {
                QuestionAnswer: true,
                TestTakerResponse: true,
                Contributors: true,
                category: true,
              },
            },
          },
        });

        if (!exam) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Exam not found',

          });
        }

        // Calculate test taker statistics
        const totalTestTakers = exam.TestSession.length;
        const passedTestTakers = exam.TestSession.filter((session) => ((session.grade / exam.numberOfQuestions) * 100) > 50).length;
        const averageGrade =
          totalTestTakers > 0 ? exam.TestSession.reduce((acc, session) => acc + session.grade, 0) / totalTestTakers : 0;
        const highestGrade = Math.max(...exam.TestSession.map((session) => session.grade));
        const lowestGrade = Math.min(...exam.TestSession.map((session) => session.grade));

        // Calculate average time spent on the exam



        // Analyze question performance
        const questionPerformance: { contrId: string; title: string; percentageCorrect: number, contrName: string }[] = [];

        exam.Questions.forEach((question) => {
          const totalTestTakers = question.TestTakerResponse.length;
          let correctCount = 0;

          question.TestTakerResponse.forEach((response) => {
            const isCorrect = response.isCorrect || false;
            if (isCorrect) {
              correctCount++;
            }
          });

          const percentageCorrect = (correctCount / totalTestTakers) * 100;
          questionPerformance.push({
            title: filter(question.title, 40),
            contrId: question.contributorId,
            contrName: question.Contributors.name,
            percentageCorrect,
          });

        });

        // Sort and extract question performance data
        const sortedQuestions = questionPerformance.sort(
          (a, b) => b.percentageCorrect - a.percentageCorrect
        );
        const highestPerformingQuestions = sortedQuestions.slice(0, 3);
        const lowestPerformingQuestions = sortedQuestions.slice(-3).reverse();

        const categoryCounts: CategoryCounts = {};

        exam.Questions.forEach((question) => {
          const categoryName = question.category.name;

          if (categoryCounts.hasOwnProperty(categoryName)) {
            categoryCounts[categoryName]++;
          } else {
            categoryCounts[categoryName] = 1;
          }
        });



        const chartData: ChartData<"doughnut", number[], unknown> = {
          labels: [],
          datasets: [{
            data: [],
            backgroundColor: [],
          }],
        };

        Object.entries(categoryCounts).forEach(([category, count], index) => {
          chartData.labels?.push(category);
          chartData.datasets[0].data.push(count);
        });
        chartData.datasets[0].backgroundColor = generateRandomColors(chartData.labels?.length || 0, false);
        const isEmptyDistribution = Object.keys(categoryCounts).length === 0;
        return {
          examId: exam.id,
          totalQuestions: exam.Questions.length,
          totalTestTakers,
          percentagePassed: (passedTestTakers / totalTestTakers) * 100,
          averageGrade: (averageGrade / exam.numberOfQuestions) * 100,
          highestGrade: (highestGrade / exam.numberOfQuestions) * 100,
          lowestGrade: (lowestGrade / exam.numberOfQuestions) * 100,
          highestPerformingQuestions,
          lowestPerformingQuestions,
          statusDistribution: {
            data: chartData,
            options: {
              responsive: true,
              maintainAspectRatio: true,
              plugins: {
                title: {
                  display: true,
                  text: isEmptyDistribution ?'Question Status Distribution' : 'No Questions Found',
                  font: {
                    size: 14,
                    weight: 'bold',
                  },
                },
                legend: {
                  position: 'right',

                },
              },
            }
          },

        };
      } catch (error) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Exam not found',

        });
      }

    }),



});
